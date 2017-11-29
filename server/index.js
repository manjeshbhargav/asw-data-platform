'use strict';

const cookieParser = require('cookie-parser');
const express = require('express');
const fs = require('fs');
const gcbucket = require('./gcbucket');
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
// const http = require('http');
const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt');

// Programmatic access constants
const PROJECT_ID = process.env.PROJECT_ID;
const BUCKET_NAME = process.env.BUCKET_NAME;
const TEST_UPLOAD_FILENAME = process.env.TEST_UPLOAD_FILENAME || 'test-upload.txt';
const TEST_UPLOAD_FILENAME_JSON = 'test-upload.json';
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TIME = process.env.TOKEN_TIME || '2h'; // in seconds
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '16mb';

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
  store: new MemcachedStore({
    servers: [MEMCACHE_URL],
    username: MEMCACHE_USERNAME,
    password: MEMCACHE_PASSWORD
  }),
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
}), async ({ user }, response) => {
  const email = user.emails[0].value;
  console.log(email);
  try {
    const bucketName = await gcbucket(email);
    // console.log(bucketName);
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

// Set up local authentication strategy
passport.use(new Strategy(
  function(username, password, cb) {
    db.users.findByUsername(username, function(err, user) {
      if (err) { return cb(err); }
      if (!user) { return cb(null, false); }
      if (user.password != password) { return cb(null, false); }
      return cb(null, user);
    });
  }));

// Create Express routes to retrieve "Welcome!"
app.get('/', function(req, res) {
  res.send("Welcome!");
});

// Create Express route to retrieve GCS BUCKET_NAME contents
app.get('/metadata/:filename', readBucketFile);

// Create Express route to authenticate and receive access token
app.post('/auth', passport.initialize(), passport.authenticate(
  'local', {
    session: false
  }), serialize, generateToken, respond);
// Example HTTP request:
// curl -X POST -H 'Content-Type: application/json' -d '{ "username": "ken", "password": "mushishi" }' localhost:3000/auth

// Create protected route for dummy resource
app.get('/authcheck', authenticate, function(req, res) {
  res.status(200).json(req.user);
});
// Example HTTP request:
// curl -H 'Authorization: Bearer [myToken]' localhost:3000/authcheck

// Create protected Express route to download file
app.get('/download/:filename', authenticate, function(req, res) {
  var filename = req.params.filename;
  storage
    .bucket(BUCKET_NAME)
    .file(filename)
    .createReadStream()
    .on('error', function(err) { console.error('ERROR: ', err)})
    .on('end', function() {'Download complete'} )
    .pipe(res);
});

// Create protected Express route to upload file
app.post('/upload/:filename', authenticate, function(req, res) {
  var filename = req.params.filename;
  var fileDest = storage.bucket(BUCKET_NAME).file(filename);
  var data = req.body;

  // Instantiates a Readable stream
  var s = new Readable();
  s._read = function noop() {};
  s.push(data);
  s.push(null);
  s.pipe(fileDest.createWriteStream())
    .on('error', function(err) { console.error('ERROR: ', err)});

  res.send(data);
  // res.send('Uploaded ' + filename + '\n');
});

// attempt to upload json specifically
app.post('/uploadjson/:filename', authenticate, function(req, res) {
  var filename = req.params.filename;
  var fileDest = storage.bucket(BUCKET_NAME).file(filename);
  var data = req.body;

  // Instantiates a Readable stream
  var s = new Readable();
  s._read = function noop() {};
  s.push(data);
  s.push(null);
  s.pipe(fileDest.createWriteStream())
    .on('error', function(err) { console.error('ERROR: ', err)});

  res.send(data);
  // res.send('Uploaded ' + filename + '\n');
})

//////////////////////
// helper functions //
//////////////////////

function serialize(req, res, next) {
  db.users.updateOrCreate(req.user, function(err, user) {
    if (err) {
      return next(err);
    }
    // we store information needed in token in req.user again
    req.user = {
      id: user.id
    };
    next();
  });
}

function generateToken(req, res, next) {
  req.token = jwt.sign({
    id: req.user.id,
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

// Gets the metadata for the file
function readBucketFile (request, response) {
  var filename = request.params.filename;
  storage
    .bucket(BUCKET_NAME)
    .file(filename)
    .getMetadata()
    .then(results => {
      const metadata = results[0];

      console.log(`File: ${metadata.name}`);
      console.log(`Bucket: ${metadata.bucket}`);
      console.log(`Storage class: ${metadata.storageClass}`);
      console.log(`ID: ${metadata.id}`);
      console.log(`Size: ${metadata.size}`);
      console.log(`Updated: ${metadata.updated}`);
      console.log(`Generation: ${metadata.generation}`);
      console.log(`Metageneration: ${metadata.metageneration}`);
      console.log(`Etag: ${metadata.etag}`);
      console.log(`Owner: ${metadata.owner}`);
      console.log(`Component count: ${metadata.component_count}`);
      console.log(`Crc32c: ${metadata.crc32c}`);
      console.log(`md5Hash: ${metadata.md5Hash}`);
      console.log(`Cache-control: ${metadata.cacheControl}`);
      console.log(`Content-type: ${metadata.contentType}`);
      console.log(`Content-disposition: ${metadata.contentDisposition}`);
      console.log(`Content-encoding: ${metadata.contentEncoding}`);
      console.log(`Content-language: ${metadata.contentLanguage}`);
      console.log(`Metadata: ${metadata.metadata}`);
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
};
