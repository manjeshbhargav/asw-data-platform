const cookieParser = require('cookie-parser');
const express = require('express');
const fs = require('fs');
const gcbucket = require('./gcbucket');
const https = require('https');
const passport = require('passport');
const path = require('path');
const session = require('express-session');
const GoogOAuth2Strategy = require('passport-google-oauth').OAuth2Strategy;

// HTTPS server constants.
const CERT = process.env.CERT || 'cert.crt';
const DOMAIN = process.env.DOMAIN || 'localhost';
const KEY = process.env.KEY || 'key.key';
const PORT = parseInt(process.env.PORT || '8080');

// Google OAuth 2.0 constants.
const GOOG_CLIENT_ID = process.env.GOOG_CLIENT_ID;
const GOOG_CLIENT_SECRET = process.env.GOOG_CLIENT_SECRET;

// App constants.
const GOOG_STORAGE_URL = 'https://console.cloud.google.com/storage/browser';

// HTTPS server cert options.
const options = {
  key: fs.readFileSync(path.join(__dirname, `../${KEY}`)),
  cert: fs.readFileSync(path.join(__dirname, `../${CERT}`))
};

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
  callbackURL: `https://${DOMAIN}:${PORT}/signin/callback`
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

// Create express app and setup root folder.
const app = express();
const webAppPath = path.join(__dirname, '../build');
app.use('/', express.static(webAppPath));

// Define express session options.
const sessionOptions = {
  resave: false,
  saveUninitialized: false,
  secret: 'asw-test-secret'
};

// Setup express middlewares.
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
  try {
    const bucketName = await gcbucket(email);
    response.redirect(`${GOOG_STORAGE_URL}/${bucketName}`);
  } catch (e) {
    response.redirect('/?state=bucketError');
  }
});

// Create and run the HTTPS server.
const server = https.createServer(options, app);
server.listen(PORT, () => {
  console.log(`Listening to port: ${PORT}...`);
});
