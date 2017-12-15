var records = [
    { id: 1, username: 'ken', password: 'x', displayName: 'Ken', emails: [ { value: 'kennethqin15@gmail.com' } ] }
  , { id: 2, username: 'abhijit', password: 'x', displayName: 'Abhijit', emails: [ { value: 'abhijit.rs@gmail.com' } ] }
];

exports.findById = function(id, cb) {
  process.nextTick(function() {
    var idx = id - 1;
    if (records[idx]) {
      cb(null, records[idx]);
    } else {
      cb(new Error('User ' + id + ' does not exist'));
    }
  });
}

exports.findByUsername = function(username, cb) {
  process.nextTick(function() {
    for (var i = 0, len = records.length; i < len; i++) {
      var record = records[i];
      if (record.username === username) {
        return cb(null, record);
      }
    }
    return cb(null, null);
  });
}

exports.updateOrCreate = function(user, cb) {
    // db dummy, we just cb the user
    cb(null, user);
  };

// exports.authenticate = function(username, password, cb) {
//     // database dummy - find user and verify password
//     if (username === 'devils name' && password === '666') {
//       cb(null, {
//         id: 666,
//         firstname: 'devils',
//         lastname: 'name',
//         email: 'devil@he.ll',
//         verified: true
//       });
//     } else {
//       cb(null, false);
//     }
//   };
