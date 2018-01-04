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
const requirement = require('../requirement/requirement');

var requiredHeaders = JSON.parse(
  fs.readFileSync(path.join(`${__dirname}/../requirement/asw_req_column_names.json`), 'utf8'));
var csv = require("csv-parser");

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
const TOKEN_TIME = process.env.TOKEN_TIME || '9999h';
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '16mb';
const JWT_FILENAME = 'jwt';
const DATA_PREFIX = 'data'; // 'Prefix by which to filter, e.g. public/';
const ROLE_OBJECT_LISTER = 'projects/glowing-palace-179100/roles/storage.objectLister';
const UPLOAD_SIZE_LIMIT = 10 * 1024 * 1024; // no larger than 10mb

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
}), serialize, generateToken, respond2, async ({ user }, response) => {
  console.log(JSON.stringify(user));
  const email = user.email;
  console.log(email);
  try {
    var bucketName = await gcb.gcbucket(email);
    console.log("Redirect to " + `${GOOG_STORAGE_URL}/${bucketName}`);
    response.redirect(`${GOOG_STORAGE_URL}/${bucketName}`);
  } catch (e) {
    console.error(e);
    response.redirect('/?state=bucketError');
  }
});

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
app.post("/upload", authenticate, upload.single("file"), (req, res, next) => {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);

  // Set up first portion of pipe (csvParser) to check headers
  var csvParser = new csv({separator: '\t'});
  csvParser.on('headers', function(headerList) {
    var fulfilled = requirement.checkFulfilledCourses(requiredHeaders, headerList);
    if (!fulfilled) {
      console.error('Header not properly formatted.')
      res.status(400).end(
        'ERROR: Header does not contain valid set of column names: ' + headerList.join() + '\n'
      );
    } else {
      csvParser.on('finish', () => {
          blobStream.end(req.file.buffer)
        });
    };
  });

  // Set up second portion of pipe to write to GCS
  const blob = storage
    .bucket(bucketName)
    .file(DATA_PREFIX + '/' + req.file.originalname);
  const blobStream = blob.createWriteStream({
    metadata: {
      contentType: req.file.mimetype
    }
  });
  blobStream.on("error", err => {
    console.error("ERROR: " + err);
  });
  blobStream.on("finish", () => {
    console.log('finished upload');
    res.status(200).end('finished upload\n');
  });

  // Send file through pipe
  csvParser.end(req.file.buffer);
});

// Create unprotected route to retrieve "Welcome!"
app.get('/welcome', function(req, res) {
  res.status(200).send("Welcome!");
});

// Create protected route for dummy resource
app.get('/authcheck', authenticate, function(req, res) {
  // var email = req.user.email;
  // var bucketName = gcb.getHash(email);
  // console.log("Bucket name: " + bucketName);
  res.status(200).json(req.user);
});
// Example HTTP request:
// curl -H 'Authorization: Bearer [myToken]' localhost:3000/authcheck

// Create protected route to list all files in bucket, user default
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Bucket#getFiles
app.get('/list/*', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = req.query.bucket;
  if (!bucketName) {
    bucketName = gcb.getHash(email);
  };
  var prefix = req.params[0];

  storage
    .bucket(bucketName)
    .getFiles({prefix: prefix})
    .then(results => {
      const files = results[0];
      var fileList = [];
      files.forEach(file => {
        fileList.push(file.name);
      });
      res.write("Listing files in bucket: " + bucketName + '\n');
      res.write(fileList.join('\n') + '\n');
      res.status(200).end();
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
});

// Create protected route to share all files in a given directory with
// specified other user
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Acl#readers
app.get('/share/*', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var bucket = storage.bucket(bucketName);
  // var recipientEmail = req.body;
  var recipientEmail = req.query.recipient;
  var prefix = req.params[0];
  if (!prefix) {
    prefix = DATA_PREFIX;
  };
  var subdir = prefix + '/'; // Prefix MUST be a subdirectory in the bucket

  // Assign the given email to the ACL role of bucket object viewer
  storage
    .bucket(bucketName)
    .getFiles({prefix: subdir}) // only share files in the specified subdir
    .then(results => {
      const files = results[0];
      files.forEach(file => {
        file.acl.readers.addUser(recipientEmail, function(err, aclObject) {});
      });
      res.status(200).send("Successfully shared all ASW data in '" + subdir +
      "' with " + recipientEmail + '\n');
    })
    .catch(err => {
      console.error('ERROR:', err);
    });

    // Gets and updates the bucket's IAM policy
    const members = [`user:${recipientEmail}`];
    const roleLister = ROLE_OBJECT_LISTER;
    bucket.iam
      .getPolicy()
      .then(results => {
        const policy = results[0];

        // Adds the new roles to the bucket's IAM policy
        policy.bindings.push({
          role: roleLister,
          members: members,
        });

        // Updates the bucket's IAM policy
        return bucket.iam.setPolicy(policy);
      })
      .then(() => {
        console.log(
          `Added the following member(s) with role ${roleLister} to ${bucketName}:`
        );
        members.forEach(member => {
          console.log(`  ${member}`);
        });
      })
      .catch(err => {
        console.error('ERROR:', err);
      });
});


// app.get('/download/:filename', authenticate, function(req, res) {
//   var email = req.user.email;
//   var bucketName = gcb.getHash(email);
//   var filename = req.params.filename;
//   storage
//     .bucket(bucketName)
//     .file(filename)
//     .createReadStream()
//     .on('error', function(err) { console.error('ERROR: ', err)})
//     .on('end', function() {'Download complete'} )
//     .pipe(res.status(200));
// });

// Create protected route to download file
// Test wildcard routing
app.get('/download/*', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = req.query.bucket;
  if (!bucketName) {
    bucketName = gcb.getHash(email);
  };
  console.log("Download from bucket " + bucketName);
  var filename = req.params[0];
  storage
    .bucket(bucketName)
    .file(filename)
    .createReadStream()
    .on('error', function(err) { console.error('ERROR: ', err)})
    .on('end', function() {'Download complete'} )
    .pipe(res.status(200));
});



//////////////////////
// helper functions //
//////////////////////

function serialize(req, res, next) {
  req.user = {
    id: req.user.id,
    email: req.user.emails[0].value
  };
  next();
  // db.users.updateOrCreate(req.user, function(err, user) {
  //   if (err) {
  //     return next(err);
  //   }
  //   // we store information needed in token in req.user again
  //   req.user = {
  //     id: user.id,
  //     email: user.emails[0].value
  //   };
  //   next();
  // });
}

function generateToken(req, res, next) {
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

function respond2(req, res, next) {
  // Save the JWT as a filename in the user's bucket (TEMPORARY SOL'N)
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var jwtFile = storage.bucket(bucketName).file(JWT_FILENAME);

  // Instantiates a Readable stream
  var s = new Readable();
  s._read = function noop() {};
  s.push(req.token);
  s.push(null);
  s.pipe(jwtFile.createWriteStream())
    .on('error', function(err) { console.error('ERROR: ', err)});

  console.log("User and email and bucket name:");
  console.log(req.user.id + "." + req.user.email + "." + bucketName);
  // res.status(200).json({
  //   user: req.user,
  //   token: req.token
  // });
  next();
}
