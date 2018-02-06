
ASW Data Platform API
=================

Kenneth Qin for Environmental Defense Fund, 2018

## Authentication by JSON Web Token

All calls require authentication via a JSON Web Token (JWT),
which can be retrieved by first authenticating via the browser at the
application website, e.g. glowing-palace-179100.appspot.com, and then
navigating to the file "system/jwt".

Verify that the JWT is not expired (replace [JWT] wherever you see it with your own JWT)

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/authcheck`

Example JWT (for demonstrating what a JWT looks like; will return Unauthorized error)

`curl -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE1MTYxNDA1MjcsImV4cCI6MTU0NzY3NjUyNywiYXVkIjoiIiwic3ViIjoiIiwiaWQiOiI0MzIxNTA4MzI1OTEwOCIsImVtYWlsIjoidGVzdDEyM0BnbWFpbC5jb20ifQ.TGZeNm0p-V6229tuiXxZtT_W4SMjm3CX31s4KHeqKZo" https://glowing-palace-179100.appspot.com/authcheck`

## Listing files

List files in your bucket, optionally filtering by a prefix

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/list/`

Response:
```
{
  "success": true,
  "prefix": "",
  "results": [
    {
      "name": "test1.txt",
      "metadata": {
        "kind": "storage#object",
        "id": “[bucketName]/test1.txt/1513026837758052",
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
```

List only files within a specified directory, e.g. "test"

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/list/test`

## Search files *(BETA feature)*

List files matching a specified prefix, e.g. “test”:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/search/test`

Response is in the same format as in `/list` route.


## Uploading files

Upload a tab-delimited .txt file to your project folder:

Note: must have valid header (i.e. first column), or else it will be rejected.

`curl -H "Authorization: Bearer [JWT]" -F "file=@/Users/[me]/Downloads/upload-valid.txt" https://glowing-palace-179100.appspot.com/upload`

Response for successful upload:

```
{
  "success": true,
  "filepath": "upload-valid.txt"
}
```

Response for failed upload (suppose that every value must be numeric, and that non-numeric values would trigger an error):

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

Download a file from your bucket to a local destination:


`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/download/data/upload-valid.txt`

Response:

```

```

To save this to a local file, simply pipe the output to a local destination:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/download/data/upload-valid.txt > [my/localpath/file.txt]`


## Sharing files

Share files matching a specified prefix (i.e. could specify a "folder")
with a specified collaborator or Google Group.

Can specify a folder, e.g. "aq-data”:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/share/aq-data?recipient=test123@gmail.com`

Response if sharing is successful:

```
{
  "success": true,
  "recipient": "rogerthatdumborat@gmail.com",
  "folder": "aq-data",
  "contents": [
    {
      "name": "aq-data/upload-invalid.txt",
      "metadata": {
        "kind": "storage#object",
        "id": "3c43a972dbc5046b8eb0fdb4f2cffadd/aq-data/upload-invalid.txt/1517864121551081", "selfLink": "https://www.googleapis.com/storage/v1/b/3c43a972dbc5046b8eb0fdb4f2cffadd/o/aq-data%2Fupload-invalid.txt",
        "name": "aq-data/upload-invalid.txt",
        "bucket": "3c43a972dbc5046b8eb0fdb4f2cffadd",
        "generation": "1517864121551081",
        "metageneration":"1",
        "contentType": "application/json",
        "timeCreated": "2018-02-05T20:55:21.531Z",
        "updated": "2018-02-05T20:55:21.531Z",
        "storageClass": "STANDARD",
        "timeStorageClassUpdated": "2018-02-05T20:55:21.531Z",
        "size": "630",
        "md5Hash": "mTmvHjshzEjlmKMt4ddMTQ==",
        "mediaLink": "https://www.googleapis.com/download/storage/v1/b/3c43a972dbc5046b8eb0fdb4f2cffadd/o/aq-data%2Fupload-invalid.txt?generation=1517864121551081&alt=media",
        "crc32c": "BEiE2Q==",
        "etag":"COmRob7Uj9kCEAE="
      }
    },

  ...

  ]
}
```

Or a sub-folder, e.g. "aq-data/test”:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/share/aq-data/test?recipient=test123@gmail.com`

Or a file, e.g. "data/folder/test/test1.txt”:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/share/aq-data/test/test1.txt?recipient=test123@gmail.com`


## Revoke sharing privileges

Revoke sharing privileges from a specified collaborator.

Response format is same as that of "/share" route.

Revoke all access for the specified user:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/revoke/aq-data?recipient=test123@gmail.com`

Or a sub-folder, e.g. "aq-data/test”:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/revoke/aq-data/test?recipient=test123@gmail.com`

Or a file, e.g. "data/folder/test/test1.txt”:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/revoke/aq-data/test/test1.txt?recipient=test123@gmail.com`
