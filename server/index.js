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

const Storage = require('@google-cloud/storage');
const bodyParser = require('body-parser');
const request = require('request');
const Readable = require('stream').Readable;
const Strategy = require("passport-local");
const db = require('../db');
const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt');

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

// Instantiates a Readable stream
const s = new Readable();
s._read = function noop() {};

// Instantiates a GCS client
const storage = Storage({
  projectId: PROJECT_ID,
});

app.use(bodyParser.json({limit: REQUEST_BODY_LIMIT}));
app.use(bodyParser.text({type: '*/*', limit: REQUEST_BODY_LIMIT}));

// Deprecated:
// // Set up local authentication strategy
// passport.use(new Strategy(
//   function(username, password, cb) {
//     db.users.findByUsername(username, function(err, user) {
//       if (err) { return cb(err); }
//       if (!user) { return cb(null, false); }
//       if (user.password != password) { return cb(null, false); }
//       return cb(null, user);
//     });
//   }));

// Deprecated:
// // Create Express route to authenticate and receive access token
// app.post('/auth', passport.initialize(), passport.authenticate(
//   'local', {
//     session: false
//   }), function(req, res, next) {
//     console.log(req.user);
//     next();
//   }, serialize, generateToken, respond);
// // Example HTTP request:
// // curl -X POST -H 'Content-Type: application/json' -d '{ "username": "ken", "password": "x" }' localhost:3000/auth

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
      // console.log('Files:');
      files.forEach(file => {
        // console.log(file.name);
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

// Create protected route to share all files in your DATA_PREFIX subdirectory
// with specified other user
// Modified from https://cloud.google.com/nodejs/docs/reference/storage/1.4.x/Acl#readers
app.post('/share', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var recipientEmail = req.body;
  var bucket = storage.bucket(bucketName);

  // Gets and updates the bucket's IAM policy
  const members = [`user:${recipientEmail}`];
  const roleLister = ROLE_OBJECT_LISTER;
  bucket.iam
    .getPolicy()
    .then(results => {
      const policy = results[0];

      // // Displays the roles in the bucket's IAM policy
      // console.log(`Roles for bucket ${bucketName}:`);
      // policy.bindings.forEach(role => {
      //   console.log(`  Role: ${role.role}`);
      //   console.log(`  Members:`);
      //
      //   const members = role.members;
      //   members.forEach(member => {
      //     console.log(`    ${member}`);
      //   });
      // });

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

  // Assign the given email to the ACL role of bucket object viewer
  storage
    .bucket(bucketName)
    .getFiles({prefix: DATA_PREFIX}) // only share files in the DATA_PREFIX subdir
    .then(results => {
      const files = results[0];
      files.forEach(file => {
        file.acl.readers.addUser(recipientEmail, function(err, aclObject) {});
      });
      res.status(200).send("Successfully shared all ASW data with " + recipientEmail + '\n');
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
});

// Create protected route to download file
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

// Create protected route to upload file
// Automatically goes into the "DATA_PREFIX/" subdirectory
app.post('/upload/:filename', authenticate, function(req, res) {
  var email = req.user.email;
  var bucketName = gcb.getHash(email);
  var filename = req.params.filename;
  var fileDest = storage.bucket(bucketName)
                        .file(DATA_PREFIX + '/' + filename);
  var data = req.body;

  // Instantiates a Readable stream
  var s = new Readable();
  s._read = function noop() {};
  s.push(data);
  s.push(null);
  s.pipe(fileDest.createWriteStream())
    .on('error', function(err) { console.error('ERROR: ', err)})
    .on('finish', function() {
      res.status(200).send("Upload successful: " + filename + "\n")
    });
});


// // attempt to upload json specifically
// app.post('/uploadjson/:filename', authenticate, function(req, res) {
//   var email = req.user.email;
//   var bucketName = gcb.getHash(email);
//   var filename = req.params.filename;
//   var fileDest = storage.bucket(bucketName).file(filename);
//   var data = req.body;
//
//   // Instantiates a Readable stream
//   var s = new Readable();
//   s._read = function noop() {};
//   s.push(data);
//   s.push(null);
//   s.pipe(fileDest.createWriteStream())
//     .on('error', function(err) { console.error('ERROR: ', err)})
//     .on('finish', function() {
//       res.status(200).send("Upload successful: " + filename + "\n")
//     });
// })

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
