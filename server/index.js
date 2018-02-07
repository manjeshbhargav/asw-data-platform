'use strict';

const cookieParser = require('cookie-parser');
const express = require('express');
const fs = require('fs');
const gcb = require('./gcbucket');
const passport = require('passport');
const path = require('path');
const session = require('express-session');
const GoogOAuth2Strategy = require('passport-google-oauth').OAuth2Strategy;
const MemcachedStore = require('connect-memjs')(session);
const multer = require('multer');

const Storage = require('@google-cloud/storage');
const bodyParser = require('body-parser');
const request = require('request');
const Readable = require('stream').Readable;
const Strategy = require("passport-local");
const db = require('../db');
const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt');
const csvParser = require("csv-parser");
const csvFast = require("fast-csv")
const async = require('async');
// const requirement = require('../requirement/requirement');

// var requiredHeaders = JSON.parse(
//   fs.readFileSync(path.join(`${__dirname}/../requirement/asw_req_column_names.json`), 'utf8'));
var requiredHeaders = fs.readFileSync(
    path.join(`${__dirname}/../requirement/asw_req_column_names.csv`), 'utf8'
  ).split(',');

console.log(requiredHeaders);

// var requirement_dict;
// var taken;
// fs.readFile('../requirement/reqs_ecoevo_sub.json', 'utf8', function (err, data) {
//     if (err) throw err;
//     requirement_dict = JSON.parse(data);
//
//     // read courses taken
//     fs.readFile('../requirement/taken_unsatisfied.txt', 'utf8', function (err, data) {
//         if (err) throw err;
//
//         taken = data.toString().split("\n");
//         if (taken[taken.length - 1] === "") {
//             taken.splice(-1);
//         }
//
//         // if both files read successfully, check whether reqs have been fulfilled
//         requirement.checkFulfilledCourses(requirement_dict, taken);
//     });
// });

// Programmatic access constants
const PROJECT_ID = process.env.PROJECT_ID;
const DEFAULT_BUCKET_NAME = process.env.DEFAULT_BUCKET_NAME;
const TEST_UPLOAD_FILENAME = process.env.TEST_UPLOAD_FILENAME || 'test-upload.txt';
const TEST_UPLOAD_FILENAME_JSON = 'test-upload.json';
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TIME = process.env.TOKEN_TIME || '168h';
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '16mb';
const JWT_FILENAME = 'jwt';
const PRIVATE_PREFIX = 'system';
const DATA_PREFIX = 'aq-data'; // 'Prefix by which to filter, e.g. public/';
const ROLE_OBJECT_LISTER = 'projects/glowing-palace-179100/roles/storage.objectLister';
const UPLOAD_SIZE_LIMIT = 10 * 1024 * 1024; // no larger than 10mb
const DELIMITER = '\t';
const REGEX_NUMERIC = /^[0-9]+$/;
// const REGEX_ALPHANUMERIC = /^[0-9a-zA-Z]+$/;
const USER_DB_FILENAME = 'users.txt';
const ERR_EXCEPTION_ACL_NOT_FOUND = 'ApiError: Not Found';

// const REGEX_VALUECHECKER = {
//
// }

// HTTP(S) server constants.
const DOMAIN = process.env.DOMAIN || 'localhost:8080';
const PORT = parseInt(process.env.PORT || '8080', 10);

// Google OAuth 2.0 constants.
const GOOG_CLIENT_ID = process.env.GOOG_CLIENT_ID;
const GOOG_CLIENT_SECRET = process.env.GOOG_CLIENT_SECRET;

// App constants.
const GOOG_STORAGE_URL = 'https://console.cloud.google.com/storage/browser';

// Redis Memcache info
let MEMCACHE_URL = process.env.MEMCACHE_URL;
let MEMCACHE_USERNAME = process.env.MEMCACHE_USERNAME;
let MEMCACHE_PASSWORD = process.env.MEMCACHE_PASSWORD;

// Session secret info
const SESSION_SECRET = process.env.SESSION_SECRET;

// Setup passport middlewares.
passport.deserializeUser((obj, done) => {
  return done(null, obj);
});
passport.serializeUser((user, done) => {
  return done(null, user);
});

// Setup Google OAuth 2.0 strategy.
passport.use(new GoogOAuth2Strategy({
  clientID: GOOG_CLIENT_ID,
  clientSecret: GOOG_CLIENT_SECRET,
  callbackURL: `http://${DOMAIN}/signin/callback`
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

// Create express app and setup root folder.
const app = express();
const webAppPath = path.join(__dirname, '../build');
app.use('/', express.static(webAppPath));
// app.use('/', express.static(__dirname));

// Setup express middlewares
const sessionOptions = {
  key: 'view:count',
  proxy: 'true',
  // store: new MemcachedStore({
  //   servers: [MEMCACHE_URL],
  //   username: MEMCACHE_USERNAME,
  //   password: MEMCACHE_PASSWORD
  // }),
  resave: false,
  saveUninitialized: false,
  secret: SESSION_SECRET
}
app.enable('trust proxy');
app.use(cookieParser());
app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());

// Authenticate using G+ credentials.
app.get('/signin', passport.authenticate('google', {
  scope: ['openid email profile']
}));

// Handle Google OAuth 2.0 server response.
app.get('/signin/callback', function(req, res, next) {
  // console.log("Entered callback");
  next();
}, passport.authenticate('google', {
  failureRedirect: '/?state=signinFailed'
}), serialize, generateToken, recordUser,
  async ({ user }, response, next) => {
    console.log(JSON.stringify(user));
    const email = user.email;
    console.log(email);
    try {
      var bucketName = await gcb.gcbucket(email);
      console.log("Redirect to " + `${GOOG_STORAGE_URL}/${bucketName}`);
      response.redirect(`${GOOG_STORAGE_URL}/${bucketName}`);
      next();
    } catch (e) {
      console.error(e);
      response.redirect('/?state=bucketError');
      next();
    }
  },
  saveToken
);

// Create and run the HTTP server.
const server = app.listen(PORT, () => {
  const port = server.address().port;
  console.log(`App listening on port ${port}`);
});

/////////////////////////
// PROGRAMMATIC ACCESS //
/////////////////////////

const authenticate = expressJwt({
  secret: JWT_SECRET
});

// Instantiates a GCS client
const storage = Storage({
  projectId: PROJECT_ID,
});

// app.use(bodyParser.json({limit: REQUEST_BODY_LIMIT}));
// app.use(bodyParser.text({type: '*/*', limit: REQUEST_BODY_LIMIT}));
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_SIZE_LIMIT
  }
});

// Create protected route to upload tab-delimited txt file and check that it
// meets header requirements
app.post("/upload*", authenticate, upload.single("file"), async (req, res) => {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);

  // Parameter/prefix MUST be a valid folder name:
  var prefix = req.params[0];
  if (prefix.length === 0) {
    prefix = DATA_PREFIX;
  } else {
    prefix = prefix.slice(1) + '/'; // ensures that parameter refers to folder
  };

  // Set up first portion of pipe (csvParser) to check headers
  var csvHeaderChecker = new csvParser({separator: DELIMITER});
  csvHeaderChecker.on('headers', function(headerList) {
    var validHeader = requiredHeaders.every(val => headerList.indexOf(val) >= 0);
    if (!validHeader) {
      res.status(400).end(
        'Upload failed: Header does not contain required set of column names: ' +
        requiredHeaders.join() + '\n'
      );
    } else {
      csvValueChecker.end(req.file.buffer);
    };
  });

  // Set up second portion of pipe to check values with regex
  var csvValueChecker = new csvFast({headers: true, delimiter: DELIMITER});
  csvValueChecker
    .validate( function(data, next) {
      var validRow = true;

      async.forEach(Object.keys(data), function(key, callback) {

          var validEntry = data[key].match(REGEX_NUMERIC); // In the future, each column should have its own regex

          // If any value is invalid, reject the entire file
          if(!validEntry) {
            var errMsg = 'Upload failed:\nInvalid entry for "' + key +
              '" in row:\n' + JSON.stringify(data) + '\n';
            console.log(errMsg);
            res.status(400).json({
              success: false,
              error_key: key,
              error_row: data
            });
            validRow = false;
          };
          callback();

        }, function(err) {
          if(err) {
            console.error(err);
          };
          next(null, validRow)
      });
    })
    .on('data-invalid', (data, index) => {
      try {
        blobStream.end( function() {
          blob.delete()
            .then(console.log("Attempted upload was deleted"))
        });
      } catch(e) {
        console.log(e.message)
      };
    })
    .on('data', data => {
      // console.log(JSON.stringify(data));
      blobStream.write(JSON.stringify(data));
    })
    .on('finish', () => {
      console.log("Upload stream finished");
      blobStream.end();
    });

    // Set up writeStream (last portion of pipe) for upload to GCS
    const filepath = prefix + req.file.originalname;
    const blob = storage
      .bucket(bucketName)
      .file(filepath);
    const blobStream = blob.createWriteStream({
      metadata: {
        // contentType: req.file.mimetype
        contentType: 'application/json'
      }
    });
    blobStream.on("error", err => {
      console.error("ERROR: " + err);
    });
    blobStream.on("finish", () => {
      // console.log('finished upload');
      res.status(200).json({
        success: true,
        filename: filepath
      });
    });

  // Send file through beginning of pipe
  csvHeaderChecker.end(req.file.buffer);
});

// Create unprotected route to retrieve "Welcome!"
app.get('/welcome', function(req, res) {
  res.status(200).send("Welcome!");
});

// Create protected route for dummy resource
app.get('/authcheck', authenticate, function(req, res) {
  res.status(200).json(req.user);
});

// app.get('/refresh-token', authenticate, generateToken, function(req, res) {
//   res.status(200).send(req.token);
// })

// Create protected route to list all files in bucket, user default
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Bucket#getFiles
app.get('/list*', authenticate, function(req, res) {
  var email = req.user.email;

  // Parameters include prefix and bucket:
  // Prefix MUST be a directory
  var prefix = req.params[0];
  if (prefix.length === 0) {
    prefix = '';
  } else {
    prefix = prefix.slice(1) + '/';
  };

  // If bucket is not specified, use the user's bucket
  var bucketName = req.query.bucket;
  if (!bucketName) {
    bucketName = gcb.getHash(email);
  };

  storage
    .bucket(bucketName)
    .getFiles({prefix: prefix})
    .then(results => {
      const files = results[0];

      // If no files found, return 404 error code
      if (files.length === 0) {
        res.status(404).json({
          success: false,
          msg: "No files found"
        })
        // res.status(404).end("No files found\n");
      } else {
        // Else loop through all files

        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use length matching to determine "end" instead.
          fileList.push({
            name: file.name,
            metadata: file.metadata,
          });

          if (fileList.length === files.length) {
            res.status(200).json({
              success: true,
              prefix: prefix,
              results: fileList
            });
          };
        });

        // res.write(`Successfully shared files in "${subdir}" with ${recipientEmail}\n`);
        // res.write("Listing files shared:\n");
        // files.forEach(file => {
        //   res.write(`https://storage.cloud.google.com/${bucketName}/${file.name}` + '\n');
        //   file.acl.readers.addUser(recipientEmail, function(err, aclObject) {});
        // });
        // res.status(200).end();

      };
    })
    .catch(err => {
      console.error('ERROR:', err);
      res.status(404).json({
        success: false,
        msg: err
      })
    });
});

// Create protected route to list all files in bucket, user default
// Identical to /list route except parameter does not need to specify folder
app.get('/search*', authenticate, function(req, res) {
  var email = req.user.email;

  // Parameters include prefix and bucket:
  // Prefix MUST be a directory
  var prefix = req.params[0];
  if (prefix.length === 0) {
    prefix = '';
  } else {
    prefix = prefix.slice(1);
  };

  // If bucket is not specified, use the user's bucket
  var bucketName = req.query.bucket;
  if (!bucketName) {
    bucketName = gcb.getHash(email);
  };

  storage
    .bucket(bucketName)
    .getFiles({prefix: prefix})
    .then(results => {
      const files = results[0];

      // If no files found, return 404 error code
      if (files.length === 0) {
        res.status(404).json({
          success: false,
          msg: "No files found"
        })
        // res.status(404).end("No files found\n");
      } else {
        // Else loop through all files

        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use length matching to determine "end" instead.
          fileList.push({
            name: file.name,
            metadata: file.metadata,
          });

          if (fileList.length === files.length) {
            res.status(200).json({
              success: true,
              prefix: prefix,
              results: fileList
            });
          };
        });

        // res.write(`Successfully shared files in "${subdir}" with ${recipientEmail}\n`);
        // res.write("Listing files shared:\n");
        // files.forEach(file => {
        //   res.write(`https://storage.cloud.google.com/${bucketName}/${file.name}` + '\n');
        //   file.acl.readers.addUser(recipientEmail, function(err, aclObject) {});
        // });
        // res.status(200).end();

      };
    })
    .catch(err => {
      console.error('ERROR:', err);
      res.status(404).json({
        success: false,
        msg: err
      })
    });
});

// Create protected route to share all files in a given directory with
// specified other user
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Acl#readers
// and https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Iam
app.get('/share*', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var bucket = storage.bucket(bucketName);
  var recipientEmail = req.query.recipient;

  // Parameters include prefix and bucket:
  // Prefix MUST be a directory
  var prefix = req.params[0];
  if (prefix.length === 0) {
    prefix = DATA_PREFIX;
  } else {
    prefix = prefix.slice(1) + '/';
  };

  // Assign the given email to the ACL role of bucket object viewer
  storage
    .bucket(bucketName)
    .getFiles({prefix: prefix}) // only share files in the specified subdir
    .then(results => {
      const files = results[0];

      // If no files found, return 404 error code
      if (files.length === 0) {
        res.status(404).json({
          success: false,
          msg: "No files found"
        })
        // res.status(404).end("No files found\n");
      } else {
        // Else loop through all files

        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use length matching to determine "end" instead.

          // Give READ access to recipient
          file.acl.readers.addUser(recipientEmail, function(err, aclObject) {
            console.error(err);
          });

          fileList.push({
            name: file.name,
            metadata: file.metadata,
          });

          if (fileList.length === files.length) {
            res.status(200).json({
              success: true,
              recipient: recipientEmail,
              folder: prefix,
              contents: fileList
            });
          };
        });

        // res.write(`Successfully shared files in "${subdir}" with ${recipientEmail}\n`);
        // res.write("Listing files shared:\n");
        // files.forEach(file => {
        //   res.write(`https://storage.cloud.google.com/${bucketName}/${file.name}` + '\n');
        //   file.acl.readers.addUser(recipientEmail, function(err, aclObject) {});
        // });
        // res.status(200).end();

      };

    })
    .catch(err => {
      console.error('ERROR:', err);
      res.status(404).json({
        success: false,
        msg: err
      });
    });

  // For now, do not give "object lister" IAM role when sharing any files
  // // Gets and updates the bucket's IAM policy
  // const members = [`user:${recipientEmail}`];
  // const roleLister = ROLE_OBJECT_LISTER;
  // bucket.iam
  //   .getPolicy()
  //   .then(results => {
  //     const policy = results[0];
  //
  //     // Adds the new roles to the bucket's IAM policy
  //     policy.bindings.push({
  //       role: roleLister,
  //       members: members,
  //     });
  //
  //     // Updates the bucket's IAM policy
  //     return bucket.iam.setPolicy(policy);
  //   })
  //   .then(() => {
  //     console.log(
  //       `Added the following member(s) with role ${roleLister} to ${bucketName}:`
  //     );
  //     members.forEach(member => {
  //       console.log(`  ${member}`);
  //     });
  //   })
  //   .catch(err => {
  //     console.error('ERROR:', err);
  //   });
});

// List files for which the recipient has READ or WRITE access
app.get('/acl', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var recipient = 'rogerthatdumborat@gmail.com'; // FOR NOW, RECIPIENT IS ROGERTHATDUMBORAT

  const options = {
    // Specify the user
    entity: `user-${recipient}`,
  };

  // Gets the ACL for the bucket for the recipient
  storage
    .bucket(bucketName)
    .getFiles()
    .then(results => {
      const files = results[0];
      var i = 0;

      files.forEach(file => { // There is no "end" event for forEach()
                              // so we use a counter to determine "end" instead.
        const filename = file.name;
        file.acl.get(options)
        .then(results => {
          i = i + 1;
          // const aclObject = results[0];
          // console.log(`${filename}\t${aclObject.role}: ${aclObject.entity}`);
          res.write(`gs://${bucketName}/${filename}\n`);
          if(i === files.length) {
            res.end();
          };
        })
        .catch(err => {
          if(err != ERR_EXCEPTION_ACL_NOT_FOUND) {
            console.error('ERROR:', err);
          } else {
            i = i + 1;
            if(i === files.length) {
              res.end();
            };
          };
        });
      });
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
  });

// app.get('/list-buckets', authenticate, function(req, res) {
//   request({
//     uri: 'https://www.googleapis.com/storage/v1/b',
//     qs: {
//
//     }
//   })
// };

// Gets and displays the bucket's IAM policy
app.get('/acl-bucket', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);

  storage
    .bucket(bucketName)
    .iam.getPolicy()
    .then(results => {
      const policy = results[0].bindings;

      // Displays the roles in the bucket's IAM policy
      console.log(`Roles for bucket ${bucketName}:`);
      policy.forEach(role => {
        console.log(`  Role: ${role.role}`);
        console.log(`  Members:`);

        const members = role.members;
        members.forEach(member => {
          console.log(`    ${member}`);
        });
      });
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
});

// Revoke access to all files in a given subdirectory from a specified other user
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Acl#readers
// and https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Iam
app.get('/revoke*', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var bucket = storage.bucket(bucketName);
  // var recipientEmail = req.body;
  var recipientEmail = req.query.recipient;

  // Parameters include prefix and bucket:
  // Prefix MUST be a directory
  var prefix = req.params[0];
  if (prefix.length === 0) {
    prefix = DATA_PREFIX;
  } else {
    prefix = prefix.slice(1) + '/';
  };

  // Assign the given email to the ACL role of bucket object viewer
  storage
    .bucket(bucketName)
    .getFiles({prefix: prefix}) // only share files in the specified subdir
    .then(results => {
      const files = results[0];

      // If no files found, return 404 error code
      if (files.length === 0) {
        res.status(404).json({
          success: false,
          msg: "No files found"
        })
        // res.status(404).end("No files found\n");
      } else {
        // Else loop through all files

        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use length matching to determine "end" instead.

          // Remove READ access from recipient
          file.acl.readers.deleteUser(recipientEmail, function(err, aclObject) {
            console.error(err);
          });

          fileList.push({
            name: file.name,
            metadata: file.metadata,
          });

          // Once all files have been read:
          if (fileList.length === files.length) {
            res.status(200).json({
              success: true,
              recipient: recipientEmail,
              folder: prefix,
              contents: fileList
            });
          };
        });
      };
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
  });

  // For now, do not give "object lister" IAM role when sharing any files
  // // Gets and updates the bucket's IAM policy
  // const members = [`user:${recipientEmail}`];
  // const roleLister = ROLE_OBJECT_LISTER;
  // bucket.iam
  //   .getPolicy()
  //   .then(results => {
  //     const policy = results[0];
  //
  //     // Finds and updates the appropriate role-member group
  //     const index = policy.bindings.findIndex(role => role.role === roleLister);
  //     let role = policy.bindings[index];
  //     if (role) {
  //       role.members = role.members.filter(
  //         member => members.indexOf(member) === -1
  //       );
  //
  //       // Updates the policy object with the new (or empty) role-member group
  //       if (role.members.length === 0) {
  //         policy.bindings.splice(index, 1);
  //       } else {
  //         policy.bindings.index = role;
  //       }
  //
  //       // Updates the bucket's IAM policy
  //       return bucket.iam.setPolicy(policy);
  //     } else {
  //       // No matching role-member group(s) were found
  //       throw new Error('No matching role-member group(s) found.');
  //     }
  //   })
  //   .then(() => {
  //     console.log(
  //       `Removed the following member(s) with role ${roleLister} from ${bucketName}:`
  //     );
  //     members.forEach(member => {
  //       console.log(`  ${member}`);
  //     });
  //   })
  // .catch(err => {
  //   console.error('ERROR:', err);
  // });

// Create protected route to download file
// Response header from this thread https://stackoverflow.com/questions/7288814/download-a-file-from-nodejs-server-using-express
app.get('/download/*', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = req.query.bucket;
  if (!bucketName) {
    bucketName = gcb.getHash(email);
  };
  var filename = req.params[0];

  console.log("Download from bucket " + bucketName);
  console.log("Download file: " + filename)

  res.setHeader('Content-disposition', 'attachment; filename=' + filename);

  var file = storage
    .bucket(bucketName)
    .file(filename)

  file
    .getMetadata()
    .then(results => {
      const metadata = results[0];
      const mimetype = metadata.contentType;
      res.setHeader('Content-type', mimetype);
    });

  file
    .createReadStream()
    .on('error', function(err) {
      if( err == "ApiError: Not Found") {
        // console.error('ERROR: ', err)
        console.error('ERROR: File not found');
        res.status(400).json({
          success: false,
          filename: filename,
          msg: "File does not exist"
        })
      }
    })
    .on('end', function() {'Download complete'} )
    .pipe(res.status(200));
    // .pipe(res.download());
});



//////////////////////
// helper functions //
//////////////////////

function serialize(req, res, next) {
  // console.log("Entered serialize");
  req.user = {
    id: req.user.id,
    email: req.user.emails[0].value
  };
  next();
}

function generateToken(req, res, next) {
  // console.log("Entered generateToken");
  req.token = jwt.sign({
    id: req.user.id,
    email: req.user.email
  }, JWT_SECRET, {
    expiresIn: TOKEN_TIME
  });
  next();
}

function respond(req, res) {
  res.status(200).json({
    user: req.user,
    token: req.token
  });
}

function saveToken(req, res) {
  // Save the JWT as a filename in the user's bucket (TEMPORARY SOL'N)
  // console.log("Entered saveToken");
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var jwtFile = storage
    .bucket(bucketName)
    .file(PRIVATE_PREFIX + '/' + JWT_FILENAME);

  var jwtStream = jwtFile.createWriteStream();
  jwtStream.on("error", err => {
    console.error("ERROR: " + err);
  });
  jwtStream.on("finish", () => {
    console.log("User and email and bucket name:");
    console.log(req.user.id + "." + req.user.email + "." + bucketName);
  });

  // Send file through pipe
  jwtStream.end(req.token);
};

function recordUser(req, res, next) {
  // Save the user ID in a file accessible only to project owners/admins
  // console.log("Entered recordUser");
  var email = req.user.email;
  var bucketName = '3c43a972dbc5046b8eb0fdb4f2cffadd';
  var readStream = storage
    .bucket(bucketName)
    .file(USER_DB_FILENAME)
    .createReadStream()
    .on('error', err => { console.error('ReadStream ERROR: ', err)})
    .on('end', () => {'Download complete'} );

  var writeStream = storage
    .bucket(bucketName)
    .file(USER_DB_FILENAME)
    .createWriteStream()
    .on("error", err => { console.error('WriteStream ERROR: ' + err)})
    .on("finish", () => {
      console.log('finished upload');
      next();
    });

  readStream.pipe(writeStream);
  writeStream.write(email + '\n');
};

// // Function to check for numeric values
// function numeric(string) {
//   if(string.match(REGEX_NUMERIC)) {
//     console.log(string + " is numeric\n");
//     return true;
//   } else {
//     console.log(string + " is NOT numeric\n");
//     return false;
//   }
// };
//
