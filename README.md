
ASW Data Platform API
=================

Kenneth Qin for Environmental Defense Fund, 2018

## Authentication by JSON Web Token

All calls require authentication via a JSON Web Token (JWT),
which can be retrieved by first authenticating via the browser at the
application website, e.g. glowing-palace-179100.appspot.com, and then
navigating to the file "system/jwt".

Example JWT (for demonstrating what a JWT looks like; will return Unauthorized error)

`curl -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE1MTYxNDA1MjcsImV4cCI6MTU0NzY3NjUyNywiYXVkIjoiIiwic3ViIjoiIiwiaWQiOiI0MzIxNTA4MzI1OTEwOCIsImVtYWlsIjoidGVzdDEyM0BnbWFpbC5jb20ifQ.TGZeNm0p-V6229tuiXxZtT_W4SMjm3CX31s4KHeqKZo" "https://glowing-palace-179100.appspot.com/authcheck"`

## Get bucket name

Get the bucket name and email associated with your JWT.

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/bucket-name"`

Response:

```
{
  "email": [yourEmail],
  "bucket": [bucketName]
}
```

## Listing files

List files and subdirectories within a specified directory of a specified bucket.

If no directory is specified, uses the `aq-data/` directory.

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/list/[bucketName]"`

Response:

```
{
  "success": true,
  "bucket": [bucketName]
  "directory": "",
  "results": {
    "directories": [
      "testfolder",
      "folder1"
    ],
    "files": [
      {
        "name": "test1.txt",
        "metadata": {
          "kind": "storage#object",
          "id": "[bucketName]/test1.txt/1513026837758052",
          "selfLink": "https://www.googleapis.com/storage/v1/b/[bucketName]/o/test1.txt",
          "name": "test1.txt",
          "bucket": "[bucketName]",
          "generation": "1513026837758052",
          "metageneration": "6",
          "timeCreated": "2017-12-11T21:13:57.742Z",
          "updated": "2017-12-28T22:33:22.435Z",
          "storageClass": "STANDARD",
          "timeStorageClassUpdated": "2017-12-11T21:13:57.742Z",
          "size": "13",
          "md5Hash": "yJfRQQr48sdPuhGx21Eeng==",
          "mediaLink": "https://www.googleapis.com/download/storage/v1/b/[bucketName]/o/test1.txt?generation=1513026837758052&alt=media",
          "crc32c": "nISA2A==",
          "etag": "COSAzZnwgtgCEAY="
        }
      },

      ...

    ]

  }
}
```

List only files within a specified directory, e.g. "testfolder"

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/list/[bucketName]?directory=testfolder"`


## Uploading files

Upload a tab-delimited .txt file to your project folder, and convert it into a JSON file.

Note: Upload file must be tab-delimited and have valid header (i.e. first column), or else it will be rejected.

`curl -H "Authorization: Bearer [JWT]" -F "file=@/Users/[me]/[path-to]/[file].txt" "https://glowing-palace-179100.appspot.com/upload/[filename].txt"`

Response for successful upload:

```
{
  "success": true,
  "filename": "[filename].txt"
}
```

Response for failed upload due to invalid header:

```
{
  "success": false,
  "msg": 'Upload failed: Header does not contain required set of column names.',
}
```

In future updates, upload method will also check to make sure that values are all valid. If not, responds with failed upload. Suppose, for instance, that all values are required to be numeric:

```
{
  "success": false,
  "error_key": "measurement_longitude_degree_decimal",
  "error_row": {
    "measurement_timestamp_epoch":"4",
    "measurement_latitude_degree_decimal":"5",
    "measurement_longitude_degree_decimal":"lol",
    "measurand_name":"7","measured_value":"8",
    "measurement_unit":"9","sampling_rate":"10",
    "data_averaging_method":"11",
    "sensor_mobility_type":"12",
    "sensor_manufacturer":"13",
    "sensor_model_name":"14"
  }
}
```

## Downloading files

Download a file from your bucket to a local destination.

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/download/[bucketName]/[filename]"`

For example, consider this request:

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/download/[bucketName]/alice.txt"`

Response:

```
Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do
...
```

To save this to a local file, simply pipe the output to a local destination:

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/download/[bucketName]/alice.txt" > [my/localpath/file.txt]`


## Sharing files

Share a single file or all files within a directory
with a specified collaborator or Google Group.

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/share/[bucketName]/[directoryOrFile]?recipient=[recipient]@gmail.com"`

Note: `recipient` parameter *must* be a Gmail address.

Response if sharing is successful:

```
{
  "success": true,
  "recipient": "[recipient]@gmail.com",
  "sharedItem": [sharedItem]
  "sharedIsFile": [true/false]
  "files": [
    {
      "name": "[filename]",
      "url": "https://storage.cloud.google.com/[bucketName]/aq-data/[filename]"
    },

  ...

  ]
}
```

Share a subdirectory, e.g. "testfolder”:

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/share/testfolder?recipient=[recipient]@gmail.com"`

Share a single file, e.g. "data/folder/test1.txt”:

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/share/data/folder/test1.txt?recipient=[recipient]@gmail.com"`


## Revoke access privileges

Revoke READ privileges to single a file or all files within a directory
from a specified collaborator or Google Group.

Response format is same as that of "/share" route.

Revoke all access for the specified user:

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/revoke/?recipient=[recipient]@gmail.com"`

Share a sub-directory, e.g. "testfolder”:

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/revoke/testfolder?recipient=[recipient]@gmail.com"`

Share a single file, e.g. "data/folder/test1.txt”:

`curl -H "Authorization: Bearer [JWT]" "https://glowing-palace-179100.appspot.com/revoke/data/folder/test1.txt?recipient=[recipient]@gmail.com"`
