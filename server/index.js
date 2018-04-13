'use strict';
// TO DO: remove all unnecessary "console.log" before deploying
// TO DO: be sure to standardize Gmail addresses by removing all '.'

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

var requiredHeaders = fs.readFileSync(
    path.join(`${__dirname}/../requirement/asw_req_column_names.csv`), 'utf8'
  ).split(',');

// Programmatic access constants
const PROJECT_ID = process.env.PROJECT_ID;
const DEFAULT_BUCKET_NAME = process.env.DEFAULT_BUCKET_NAME;
const TEST_UPLOAD_FILENAME = process.env.TEST_UPLOAD_FILENAME || 'test-upload.txt';
const TEST_UPLOAD_FILENAME_JSON = 'test-upload.json';
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TIME = process.env.TOKEN_TIME || '168h';
const AUTH_LATENCY = process.env.AUTH_LATENCY || '750'; // milliseconds to delay responses to discourage brute-force attacks
const JWT_FILENAME = 'jwt_donotshare';
const PRIVATE_PREFIX = 'system';
const DATA_PREFIX = 'aq-data'; // 'Prefix by which to filter, e.g. public/';
const DATA_PREFIX_REGEX = new RegExp("^(" + DATA_PREFIX + "/)");
const ROLE_OBJECT_LISTER = 'projects/glowing-palace-179100/roles/storage.objectLister';
const ROLE_COLLABORATOR = 'projects/glowing-palace-179100/roles/storage.collaborator';
const UPLOAD_SIZE_LIMIT = process.env.UPLOAD_SIZE_LIMIT || 25 * 1024 * 1024; // no larger than 25 MB
const UPLOAD_DELIMITER = '\t';
const FILENAME_DELIMITER_SUB = ':';
const REGEX_NUMERIC = /^[0-9]+$/;
const REGEX_ANYTHING_GOES = /.*/;
// const REGEX_ALPHANUMERIC = /^[0-9a-zA-Z]+$/;
const USER_DB_FILENAME = 'users.txt';
const ERR_EXCEPTION_ACL_NOT_FOUND = 'ApiError: Not Found';
const DIRECTORY_CONTENT_TYPE = "application/x-www-form-urlencoded;charset=UTF-8";

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
app.get('/signin/callback', passport.authenticate('google', {
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
app.post("/upload/:bucketName/*", intentionalLatency, authenticate,
getBucketName, upload.single("file"), getFileName, async (req, res) => {
  var bucketName = req.bucketName;
  // Current implementation requires that the bucket containing the item matches
  // the bucket associated with the sharer's email. Future implementations
  // may allow people to share objects in other buckets, if given permission
  // by the bucket owner.
  if(bucketName != gcb.getHash(req.email)) {
    res.status(404).json({
      success: false,
      msg: "You may only share objects contained within your own bucket."
    });
  };

  var filename = req.filename;

  // // Set up first portion of pipe (csvParser) to check headers
  // var csvHeaderChecker = new csvParser({separator: UPLOAD_DELIMITER});
  // csvHeaderChecker.on('headers', function(headerList) {
  //   var validHeader = requiredHeaders.every(val => headerList.indexOf(val) >= 0);
  //   if (!validHeader) {
  //     res.status(400).json({
  //       success: false,
  //       msg: 'Upload failed: Header does not contain required set of column names.',
  //       requiredHeaders: requiredHeaders
  //     });
  //   } else {
  //     csvValueChecker.end(req.file.buffer);
  //   };
  // });
  //
  // // Set up second portion of pipe to check values with regex
  // var csvValueChecker = new csvFast({headers: true, delimiter: UPLOAD_DELIMITER});
  // csvValueChecker
  //   .validate( function(data, next) {
  //     var validRow = true;
  //
  //     async.forEach(Object.keys(data), function(key, callback) {
  //
  //         var validEntry = data[key].match(REGEX_ANYTHING_GOES); // In the future, each column should have its own regex
  //
  //         // If any value is invalid, reject the entire file
  //         if(!validEntry) {
  //           var errMsg = 'Upload failed:\nInvalid entry for "' + key +
  //             '" in row:\n' + JSON.stringify(data) + '\n';
  //           console.log(errMsg);
  //           res.status(400).json({
  //             success: false,
  //             error_key: key,
  //             error_row: data
  //           });
  //           validRow = false;
  //         };
  //         callback();
  //
  //       }, function(err) {
  //         if(err) {
  //           console.error(err);
  //         };
  //         next(null, validRow)
  //     });
  //   })
  //   .on('data-invalid', (data, index) => {
  //     try {
  //       blobStream.end( function() {
  //         blob.delete()
  //           .then(console.log("Attempted upload was deleted"))
  //       });
  //     } catch(e) {
  //       console.log(e.message)
  //     };
  //   })
  //   .on('data', data => {
  //     // console.log(JSON.stringify(data));
  //     blobStream.write(JSON.stringify(data));
  //   })
  //   .on('finish', () => {
  //     console.log("Upload stream finished");
  //     blobStream.end();
  //   });

    // Set up writeStream (last portion of pipe) for upload to GCS
    const blob = storage
      .bucket(bucketName)
      .file(filename);
    const blobStream = blob.createWriteStream({
      metadata: {
        // contentType: req.file.mimetype
        // contentType: 'application/json'
      }
    });
    blobStream.on("error", err => {
      console.error("ERROR: " + err);
    });
    blobStream.on("finish", () => {
      // console.log('finished upload');
      res.status(200).json({
        success: true,
        bucket: bucketName,
        filename: req.filenameDisplay
      });
    });

  // Send file through beginning of pipe
  // csvHeaderChecker.end(req.file.buffer);
  blobStream.end(req.file.buffer);

  // req.originalDirectory = directory;
});
  // next();
// Before closing this function, create any implied folders
// }, createImpliedFolders);


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

// TO DO: Make this standardize Gmails by removing all '.'
// Create protected route to return the bucket name associated with the JWT
app.get('/bucket-name', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  res.json({
    bucketName: bucketName,
    email: email
  })
});

// Create protected route to list all files and subdirectories in specified
// directory
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Bucket#getFiles
// Directory-listing workaround modified from https://github.com/googleapis/nodejs-storage/issues/26
app.get('/list/:bucketName/*', intentionalLatency, authenticate, getBucketName,
getDirectory, function(req, res) {
  var bucketName = req.bucketName;
  // Current implementation requires that the bucket containing the item matches
  // the bucket associated with the sharer's email. Future implementations
  // may allow people to share objects in other buckets, if given permission
  // by the bucket owner.
  if(bucketName != gcb.getHash(req.email)) {
    res.status(404).json({
      success: false,
      msg: "You may only share objects contained within your own bucket."
    });
  };

  var directory = req.directory;

  console.log("Bucket name: " + bucketName);
  console.log("Directory: " + directory);

  var directoryList = [];

  storage
    .bucket(bucketName)
    .getFiles({
      prefix: directory,
      delimiter:'/',
      autoPaginate: false
    }, getFilesPaginate);

  // Callback function for the bucket.getFiles() method to be able to
  // list all directories in apiResponse, and then to respond to client
  function getFilesPaginate(err, files, nextQuery, apiResponse) {
    if(err) {
      console.error("ERROR in list:", err);
    };

    var stepDirectoryList = apiResponse.prefixes;
    if(stepDirectoryList) {
      directoryList = directoryList.concat(stepDirectoryList);
    };

    // If not done, call again
    if (nextQuery) {
      bucket.getFiles(nextQuery, getFilesPaginate)

    // If done, retrieve files next, then respond to client
    } else {

      // If no files or directories found, indicates invalid directory
      // return 404 error
      if (directoryList.length === 0 && files.length === 0) {
        res.status(404).json({
          success: false,
          msg: "Invalid directory"
        });

      // Else loop through files
      // return 200 code
      } else {
        var i = 0;
        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use a counter to determine "end" instead.
          // Filter out directories
          if(file.metadata.contentType != DIRECTORY_CONTENT_TYPE) {
            fileList.push({
              name: (file.name).replace(DATA_PREFIX_REGEX, ""),
              metadata: file.metadata,
            });
          };

          i = i + 1;
        });

        // When counter increases to length of files in getFiles response,
        // then respond to client
        if (i === files.length) {
          res.status(200).json({
            success: true,
            bucket: bucketName,
            directory: req.directoryDisplay,
            results: {
              directories: directoryList,
              files: fileList
            }
          });
        };
      };
    };
  };
});

// TO DO: Create equivalent version for single file
// Create protected route to share all files in a given directory with
// specified other user
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Acl#readers
// and https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Iam
app.get('/share/:bucketName/*', intentionalLatency, authenticate, getBucketName,
getSharedItem, function(req, res) {
  var bucketName = req.bucketName;
  // Current implementation requires that the bucket containing the item matches
  // the bucket associated with the sharer's email. Future implementations
  // may allow people to share objects in other buckets, if given permission
  // by the bucket owner.
  if(bucketName != gcb.getHash(req.email)) {
    res.status(404).json({
      success: false,
      msg: "You may only share objects contained within your own bucket."
    });
  };

  var recipientEmail = req.query.recipient;
  var sharedIsFile = req.sharedIsFile;
  var sharedItem = req.sharedItem;

  // Case 1 (out of 2): Shared item is a single file
  if (sharedIsFile) {

    var file = storage.bucket(bucketName).file(sharedItem);

    // Give READ access to recipient
    file.acl.readers.addUser(recipientEmail, function(err, aclObject) {
      if (err) {
        console.error(err);
        res.status(404).json({
          success: false,
          msg: "Unexpected error. Did you specify a recipient?"
        });
      } else {
        res.status(200).json({
          success: true,
          bucket: bucketName,
          recipient: recipientEmail,
          sharedItem: req.sharedItemDisplay,
          sharedIsFile: sharedIsFile,
          files: {
            name: (file.name).replace(DATA_PREFIX_REGEX, ""),
            url: `https://storage.cloud.google.com/${bucketName}/${file.name}`
          }
        });
      };
    });

  // Case 2 (out of 2): Shared item is a directory
  } else {

    // Retrieve all files with prefix matching the [item] parameter
    storage
      .bucket(bucketName)
      .getFiles({prefix: sharedItem}) // only share files in the specified subdir
      .then(results => {
        const files = results[0];

        // If no files found, return 404 error code
        if (files.length === 0) {
          res.status(404).json({
            success: false,
            msg: "No files found"
          })

        // Else loop through all files
        } else {
          var fileList = [];
          var errorInLoop = false;
          files.forEach(file => { // There is no "end" event for forEach()
                                  // so we use length matching to determine "end" instead.

            // Give READ access to recipient
            file.acl.readers.addUser(recipientEmail, function(err, aclObject) {

              fileList.push({
                name: (file.name).replace(DATA_PREFIX_REGEX, ""),
                url: `https://storage.cloud.google.com/${bucketName}/${file.name}`
              });

              if (err) {
                errorInLoop = true;
                console.error("ERROR: " + err);
              };

              if (fileList.length === files.length) {
                if(errorInLoop) {
                  res.status(404).json({
                    success: false,
                    msg: "Unexpected error. Did you specify a recipient?"
                  });
                } else {
                  if (fileList.length === files.length) {
                    res.status(200).json({
                      success: true,
                      bucket: bucketName,
                      recipient: recipientEmail,
                      sharedItem: req.sharedItemDisplay,
                      sharedIsFile: sharedIsFile,
                      files: fileList
                    });
                  };
                };
              };
            });

            // fileList.push({
            //   name: (file.name).replace(DATA_PREFIX_REGEX, ""),
            //   metadata: file.metadata,
            // });

          });

        };

      })
      .catch(err => {
        console.error('ERROR:', err);
        res.status(404).json({
          success: false,
          msg: "Unexpected error"
        });
      });
  };

  // For now, do not give "object lister" IAM role when sharing any files
  // // Gets and updates the bucket's IAM policy
  // const members = [`user:${recipientEmail}`];
  // bucket.iam
  //   .getPolicy()
  //   .then(results => {
  //     const policy = results[0];
  //
  //     // Adds the new roles to the bucket's IAM policy
  //     policy.bindings.push({
  //       role: ROLE_COLLABORATOR,
  //       members: members,
  //     });
  //
  //     // Updates the bucket's IAM policy
  //     return bucket.iam.setPolicy(policy);
  //   })
  //   .then(() => {
  //     console.log(
  //       `Added the following member(s) with role ${ROLE_COLLABORATOR} to ${bucketName}:`
  //     );
  //     members.forEach(member => {
  //       console.log(`  ${member}`);
  //     });
  //   })
  //   .catch(err => {
  //     console.error('ERROR:', err);
  //   });
});

// Revoke access to all files in a given subdirectory from a specified other user
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Acl#readers
// and https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Iam
app.get('/revoke/:bucketName/*', intentionalLatency, authenticate,
getBucketName, getSharedItem, function(req, res) {
  var bucketName = req.bucketName;
  // Current implementation requires that the bucket containing the item matches
  // the bucket associated with the sharer's email. Future implementations
  // may allow people to share objects in other buckets, if given permission
  // by the bucket owner.
  if(bucketName != gcb.getHash(req.email)) {
    res.status(404).json({
      success: false,
      msg: "You may only share objects contained within your own bucket."
    });
  };

  var recipientEmail = req.query.recipient;
  var sharedIsFile = req.sharedIsFile;
  var sharedItem = req.sharedItem;

  // Case 1 (out of 2): Shared item is a single file
  if (sharedIsFile) {

    var file = storage.bucket(bucketName).file(sharedItem);

    // Revoke READ access from recipient
    file.acl.readers.deleteUser(recipientEmail, function(err, aclObject) {
      if (err) {
        console.error(err);
        res.status(404).json({
          success: false,
          msg: "Unexpected error. Did you specify a recipient?"
        });
      } else {
        res.status(200).json({
          success: true,
          bucket: bucketName,
          recipient: recipientEmail,
          sharedItem: req.sharedItemDisplay,
          sharedIsFile: sharedIsFile,
          files: {
            name: (file.name).replace(DATA_PREFIX_REGEX, ""),
            url: `https://storage.cloud.google.com/${bucketName}/${file.name}`
          }
        });
      };
    });

  // Case 2 (out of 2): Shared item is a directory
  } else {

    // Retrieve all files with prefix matching the [item] parameter
    storage
      .bucket(bucketName)
      .getFiles({prefix: sharedItem}) // only share files in the specified subdir
      .then(results => {
        const files = results[0];

        // If no files found, return 404 error code
        if (files.length === 0) {
          res.status(404).json({
            success: false,
            msg: "No files found"
          })

        // Else loop through all files
        } else {
          var fileList = [];
          var errorInLoop = false;
          files.forEach(file => { // There is no "end" event for forEach()
                                  // so we use length matching to determine "end" instead.

            // Revoke READ access from recipient
            file.acl.readers.deleteUser(recipientEmail, function(err, aclObject) {

              fileList.push({
                name: (file.name).replace(DATA_PREFIX_REGEX, ""),
                url: `https://storage.cloud.google.com/${bucketName}/${file.name}`
              });

              if (err && err != "ApiError: Not Found") {
                console.error('ERROR: ', err)
                errorInLoop = true;
              };

              if (fileList.length === files.length) {
                if(errorInLoop) {
                  res.status(404).json({
                    success: false,
                    msg: "Unexpected error. Did you specify a recipient?"
                  });
                } else {
                  if (fileList.length === files.length) {
                    res.status(200).json({
                      success: true,
                      bucket: bucketName,
                      recipient: recipientEmail,
                      sharedItem: req.sharedItemDisplay,
                      sharedIsFile: sharedIsFile,
                      files: fileList
                    });
                  };
                };
              };
            });

            // fileList.push({
            //   name: (file.name).replace(DATA_PREFIX_REGEX, ""),
            //   metadata: file.metadata,
            // });

          });

        };

      })
      .catch(err => {
        console.error('ERROR:', err);
        res.status(404).json({
          success: false,
          msg: "Unexpected error"
        });
      });
  };

  // For now, do not give "object lister" IAM role when sharing any files
  // // Gets and updates the bucket's IAM policy
  // const members = [`user:${recipientEmail}`];
  // bucket.iam
  //   .getPolicy()
  //   .then(results => {
  //     const policy = results[0];
  //
  //     // Finds and updates the appropriate role-member group
  //     const index = policy.bindings.findIndex(role => role.role === ROLE_COLLABORATOR);
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
  //       `Removed the following member(s) with role ${ROLE_COLLABORATOR} from ${bucketName}:`
  //     );
  //     members.forEach(member => {
  //       console.log(`  ${member}`);
  //     });
  //   })
  // .catch(err => {
  //   console.error('ERROR:', err);

});



// Create protected route to download file
// Response header from this thread https://stackoverflow.com/questions/7288814/download-a-file-from-nodejs-server-using-express
app.get('/download/:bucketName/*', intentionalLatency, authenticate,
getBucketName, getFileName, function(req, res) {
  var bucketName = req.bucketName;
  // Current implementation requires that the bucket containing the item matches
  // the bucket associated with the sharer's email. Future implementations
  // may allow people to share objects in other buckets, if given permission
  // by the bucket owner.
  if(bucketName != gcb.getHash(req.email)) {
    res.status(404).json({
      success: false,
      msg: "You may only share objects contained within your own bucket."
    });
  };

  var filename = req.filename;

  // console.log("Download from bucket " + bucketName);
  // console.log("Download file: " + filename)

  res.setHeader('Content-disposition', 'attachment; filename=' + filename);

  var file = storage
    .bucket(bucketName)
    .file(filename)

  // file
  //   .getMetadata()
  //   .then(results => {
  //     const metadata = results[0];
  //     const mimetype = metadata.contentType;
  //     res.setHeader('Content-type', mimetype);
  //   });

  file
    .createReadStream()
    .on('error', function(err) {
      if (err == "ApiError: Not Found") {
        // console.error('ERROR: ', err)
        console.error('ERROR: File not found');
        res.status(400).json({
          success: false,
          filename: req.filenameDisplay,
          msg: "File does not exist"
        })
      }
    })
    .on('end', function() {'Download complete'} )
    .pipe(res.status(200));
});



//////////////////////
// helper functions //
//////////////////////

// Set intentional latency, intended to discourage brute-force attacks on
// JWT authentication
function intentionalLatency(req, res, next) {
  setTimeout(next, AUTH_LATENCY);
};

function serialize(req, res, next) {
  req.user = {
    id: req.user.id,
    email: req.user.emails[0].value
  };
  next();
};

function generateToken(req, res, next) {
  req.token = jwt.sign({
    id: req.user.id,
    email: req.user.email
  }, JWT_SECRET, {
    expiresIn: TOKEN_TIME
  });
  next();
};

function respond(req, res) {
  res.status(200).json({
    user: req.user,
    token: req.token
  });
};

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

// Save the user ID in a file accessible only to project owners/admins
// TO DO: save to a different, more permanent storage destination
function recordUser(req, res, next) {
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

async function listDirectories(req, res, next) {
  var bucketName = req.bucketName;
  var directory = req.directory;
  var directoryLevel = req.directory.split('/').length;

  storage
    .bucket(bucketName)
    .getFiles({
      prefix: directory,
      // delimiter:'/'
    })
    .then(results => {
      const files = results[0];

      // If no files found, just callback
      if (files.length === 0) {
        next();

      // Else loop through all files
      } else {
        var i = 0;
        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use a counter to determine "end" instead.
          // Must meet two conditions to be a first-order directory
          // 1. metadata.contentType must be DIRECTORY_CONTENT_TYPE
          if(file.metadata.contentType === DIRECTORY_CONTENT_TYPE) {
            // 2. the directory's nestedness level must be exactly one greater
            //    than the directory specified in the request parameters
            if(file.name.split('/').length === directoryLevel + 1) {
              fileList.push({
                name: (file.name).replace(DATA_PREFIX_REGEX, ""),
                metadata: file.metadata,
              });
            };
          };

          i = i + 1;

          if (i === files.length) {
            req.directoryList = fileList;
            next();
          };
        });

      };
    })
    .catch(err => {
      console.error('ERROR:', err);
      res.status(404).json({
        success: false,
        msg: err
      })
    });
};

async function listFiles(req, res, next) {
  var bucketName = req.bucketName;
  var directory = req.directory;

  storage
    .bucket(bucketName)
    .getFiles({
      prefix: directory,
      delimiter:'/'
    })
    .then(results => {
      const files = results[0];

      // If no files found, just callback
      if (files.length === 0) {
        next();

      // Else loop through all files
      } else {
        var i = 0;
        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use a counter to determine "end" instead.
          // Filter out directories
          if(file.metadata.contentType != DIRECTORY_CONTENT_TYPE) {
            fileList.push({
              name: (file.name).replace(DATA_PREFIX_REGEX, ""),
              metadata: file.metadata,
            });
          };

          i = i + 1;

          if (i === files.length) {
            req.fileList = fileList;
            next();
          };
        });

      };
    })
    .catch(err => {
      console.error('ERROR:', err);
      res.status(404).json({
        success: false,
        msg: err
      })
    });
};

async function listDirectoriesAndFiles(req, res, next) {
  var bucketName = req.bucketName;
  var directory = req.directory;

  storage
    .bucket(bucketName)
    .getFiles({
      prefix: directory,
      delimiter:'/'
    })
    .then(results => {
      const files = results[0];
      console.log("RESULTS:");
      console.log(results);

      // If no files found, just callback
      if (files.length === 0) {
        next();

      // Else loop through all files
      } else {
        var i = 0;
        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use a counter to determine "end" instead.
          // Filter out directories
          if(file.metadata.contentType != DIRECTORY_CONTENT_TYPE) {
            fileList.push({
              name: (file.name).replace(DATA_PREFIX_REGEX, ""),
              metadata: file.metadata,
            });
          };

          i = i + 1;

          if (i === files.length) {
            req.fileList = fileList;
            next();
          };
        });

      };
    })
    .catch(err => {
      console.error('ERROR:', err);
      res.status(404).json({
        success: false,
        msg: err
      })
    });
};

// Function to get bucket name associated with JWT
// If bucket is not specified, use the user's bucket
function getBucketName(req, res, next) {
  var param = req.params.bucketName;
  if (param.length != 0) {
    req.bucketName = param;
  } else {
    req.bucketName = gcb.getHash(req.user.email);
  };
  next();
};

// Function to parse directory from query parameter
// by appending '/' to param if it is not already there
function getDirectory(req, res, next) {
  var param = req.params[0];

  // If directory is defined
  if (param) {

    // This if-else statement ensures the final character is a '/'
    if(param.slice(-1) != '/') {
      req.directory = DATA_PREFIX + '/' + param + '/';
      req.directoryDisplay = param + '/';
    } else {
      req.directory = DATA_PREFIX + '/' + param;
      req.directoryDisplay = param;
    };

  // If directory is not defined, default
  } else {
    req.directory = DATA_PREFIX + '/';
    req.directoryDisplay = '';
  };

  next();
};

// Extract filename from query parameters for upload and download.
// If undefined, and if uploading, use file's original name.
function getFileName(req, res, next) {
  var param = req.params[0];

  // If filename was not specified
  if (!param) {

     // If this is an upload
    if(req.file) {
      param = req.file.originalname;

    // Else if this is a download
    } else {
      res.status(400).json({
        success: false,
        msg: "File name required but not specified."
      });
    };
  };

  req.filename = DATA_PREFIX + '/' + param;
  req.filenameDisplay = param;
  next();
};

// Extract file name or directory name from query parameters for sharing
// and revoking, and identifies whether item is file or directory.
function getSharedItem(req, res, next) {
  var param = req.params[0];
  var prefixedParam = DATA_PREFIX + '/' + param;

  // If item name is not specified, assume DATA_PREFIX root directory
  if(!param) {
    req.sharedIsFile = false;
    req.sharedItem = DATA_PREFIX + '/';
    req.sharedItemDisplay = '';
    next();

  // If item name is specified
  } else {

    // First check to see if item is a file
    storage.bucket(req.bucketName).file(prefixedParam).exists()
      .then( data => {
        var exists = data[0];

        // If item is a single file, continue with this file
        // and set sharedIsFile = true
        if (exists) {
          req.sharedIsFile = true;
          req.sharedItem = prefixedParam;
          req.sharedItemDisplay = param;

        // If item is NOT a single file, assume that it must be a directory
        } else {
          req.sharedIsFile = false;

          // This if-else statement ensures the final character is a '/'
          if(param.slice(-1) != '/') {
            req.sharedItem = prefixedParam + '/';
            req.sharedItemDisplay = param + '/';
          } else {
            req.sharedItem = prefixedParam;
            req.sharedItemDisplay = param;
          };
        };
        next();

      });
  };
};

// Function for upload method to get filename from query parameter,
// or, if undefined, use file's original name.
// Replaces '/' with FILENAME_DELIMITER_SUB
// function getFileName(req, res, next) {
//   var param = req.query.filename;
//   if (param) {
//     req.filename = param.replace('/', FILENAME_DELIMITER_SUB);
//   } else {
//     req.filename = req.file.originalname.replace('/', FILENAME_DELIMITER_SUB);
//   };
//   next();
// }

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

// // Function to make folders if upload specifies a directory structure that
// // includes folders that do not currently exist as objects.
// // Requires request object containing "originalDirectory" field.
// async function createImpliedFolders(req, res) {
//   var currentDirectory = req.directory;
//   console.log("Checking directory: " + currentDirectory);
//
//   // Base case
//   if (!currentDirectory) {
//     console.log("Creating all implied folders in " + req.originalDirectory);
//
//   // Recursive step
//   } else {
//     var folder = storage
//       .bucket(req.bucketName)
//       .file(currentDirectory);
//
//     folder
//       .exists()
//       .then( data => {
//         var exists = data[0];
//         console.log("Exists?: " + exists);
//         // Create a directory object only if it does not already exist
//         if (!exists) {
//           folder.createWriteStream({
//             metadata: {
//               contentType: DIRECTORY_CONTENT_TYPE
//             }
//           })
//             .on('end', function() {
//               console.log('Created Implied Folder: ' + req.bucketName + '/' + currentDirectory);
//             })
//             .end('');
//         };
//       })
//       .catch( err => {
//         console.error('createImpliedFolders ERROR: ', err);
//       });
//
//     // Run the recursion
//     var sliceIndex = currentDirectory.slice(0,-1).lastIndexOf("/") + 1;
//     var nextDirectory = currentDirectory.slice(0, sliceIndex);
//     createImpliedFolders({
//       directory: nextDirectory,
//       originalDirectory: req.originalDirectory,
//       bucketName: req.bucketName
//     }, res);
//   };
// };



////////////////////
// ROUTES IN BETA //
////////////////////

// Identical to /list route except parameter does not need to specify folder
app.get('/search*', authenticate, getBucketName, function(req, res) {
  var bucketName = req.bucketName;

  // Parameters include prefix:
  // Prefix NEED NOT be a directory
  var prefix = req.params[0];
  if (prefix.length === 0) {
    prefix = '';
  } else {
    prefix = prefix.slice(1);
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
        });

      // Else loop through all files
      } else {

        var fileList = [];
        files.forEach(file => { // There is no "end" event for forEach()
                                // so we use length matching to determine "end" instead.
          fileList.push({
            name: (file.name).replace(DATA_PREFIX_REGEX, ""),
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

// List files for which the recipient has READ or WRITE access
app.get('/list-acl/:bucketName', authenticate, getBucketName, getDirectory, function(req, res) {
  // var recipient = 'rogerthatdumborat@gmail.com'; // FOR NOW, RECIPIENT IS ROGERTHATDUMBORAT
  var bucketName = req.bucketName;
  var directory = req.directory;
  var recipient = req.query.recipient;

  const options = {
    // Specify the user
    entity: `user-${recipient}`,
  };

  // Gets the ACL for the bucket for the recipient
  storage
    .bucket(bucketName)
    .getFiles({
      prefix: directory,
      delimiter: '/'
    })
    .then(results => {
      const files = results[0];

      if (files.length === 0) {
        res.status(404).json({
          success: false,
          msg: "No files/directories found"
        })
      };

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

// TO DO: only list buckets to which the requester has IAM viewer privileges
app.get('/list-buckets', authenticate, function(req, res) {
  storage.getBuckets()
    .then( results => {
      var buckets = results[0];

      // Not sure if this would ever happen though
      if (buckets.length === 0) {
        res.status(404).json({
          success: false,
          msg: "No buckets found"
        })
      };

      var i = 0;
      var bucketList = [];
      buckets.forEach(bucket => { // There is no "end" event for forEach()
                                  // so we use a counter to determine "end" instead.
        bucketList.push(bucket.name);

        i = i + 1;

        if(i === buckets.length) {
          res.status(200).json({
            success: true,
            buckets: bucketList
          });
        };
      });
    })
    .catch(err => {
      console.error("ERROR in list-buckets:", err)
    });
});

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
