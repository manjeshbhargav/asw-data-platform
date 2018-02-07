'use strict';

const PROJECT_ID = process.env.PROJECT_ID || 'asw-error-catchall-117';
const BUCKET_NAME_SALT = process.env.BUCKET_NAME_SALT;

const crypto = require('crypto');
const Storage = require('@google-cloud/storage');
const storage = new Storage({
  projectId: PROJECT_ID
});

/**
 * Ensures the presence of a Google Cloud Storage bucket for the given email.
 * @param {string} email
 * @returns {Promise<string>} The name of the bucket.
 */
async function gcbucket(email) {
  // console.log("Entered gbucket");
  const hash = getHash(email);

  // If the bucket already exists, return its name.
  const bucket = storage.bucket(hash);
  const [ exists ] = await bucket.exists();
  if (exists) {
    return bucket.name;
  };

  // Create a new bucket.
  const [ newBucket ] = await bucket.create();

  // Assign the given email to the role of the bucket's admin.
  const [ iamPolicy ] = await newBucket.iam.getPolicy();
  const members = [`user:${email}`];
  const roleCreator = 'roles/storage.objectCreator';
  const roleViewer = 'roles/storage.objectViewer';
  iamPolicy.bindings.push({ role: roleCreator, members });
  iamPolicy.bindings.push({ role: roleViewer, members });
  await newBucket.iam.setPolicy(iamPolicy);

  // Return the newly created bucket's name.
  return newBucket.name;
}

function getHash(email) {
  const hash = crypto
    .createHash('md5')
    .update(`${BUCKET_NAME_SALT}-${email}`)
    .digest('hex');
  return hash;
}

module.exports = {
  gcbucket,
  getHash
};
