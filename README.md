# ASW Data Platform API Documentation
Kenneth Qin for Environmental Defense Fund, 2018.

Last updated on 16 April 2018.

Currently deployed at [https://glowing-palace-179100.appspot.com](https://glowing-palace-179100.appspot.com/).

--------------

## Table of Contents

1. [Getting Started](#getting-started)
2. [/list](#list)
3. [/upload](#upload)
4. [/download](#download)
5. [/share](#share)
6. [/revoke](#revoke)

--------------

## Getting Started

All API calls are authenticated via JSON Web Token (JWT), which must be retrieved by first signing in via the browser at the application website, [https://glowing-palace-179100.appspot.com](https://glowing-palace-179100.appspot.com/), and then navigating to the file `system/jwt_donotshare`.

Example JWT, for demonstrating what a JWT looks like:

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE1MTYxNDA1MjcsImV4cCI6MTU0NzY3NjUyNywiYXVkIjoiIiwic3ViIjoiIiwiaWQiOiI0MzIxNTA4MzI1OTEwOCIsImVtYWlsIjoidGVzdDEyM0BnbWFpbC5jb20ifQ.TGZeNm0p-V6229tuiXxZtT_W4SMjm3CX31s4KHeqKZo
```

## /list

Lists all files and subdirectories* within a specified directory of your bucket.

*"Subdirectories"/”folders” refers to the substrings of object names preceding the ‘/’ delimiter within the specified directory; for example, a directory containing the objects a/file1.txt, b/file10.txt and b/file20.txt contains the subdirectories a/ and b/.

### HTTP request URI

`GET https://glowing-palace-179100.appspot.com/list/[bucket]/[directory]`

### Parameters

| Parameter name | Parameter type | Value | Description |
| ----- | ----- | ----- | ----- |
| `bucket` | `path` | `string` | Name of bucket in which to look for objects. |
| `directory` | `path` | `string` | Filter results to objects whose names begin with this prefix. If left blank, does not filter results. |


### Request header

`Authorization: Bearer [JWT]`

### Request body

Do not supply a request body with this method.

### Example request via curl

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/list/[bucket]/[directory]`

### Response

If successful, this method returns a response body with the following structure:

```
{
  "success": true,
  "bucket": [bucketName],
  "directory": "",
  "results": {
    "directories": [
      "test",
      "directory1"
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

## /upload

Upload a file to your bucket. Maximum upload size is 25 MB as of April 9, 2018.

### HTTP request URI

`POST https://glowing-palace-179100.appspot.com/upload/[bucket]/[filename]`

### Parameters

| Parameter name | Parameter type | Value | Description |
| ----- | ----- | ----- | ----- |
| `bucket` | `path` | `string` | Name of bucket in which to save file. |
| `filename` | `path` | `string` | Filename including any prefix, i.e. the filepath. If left blank, defaults to original name of uploaded file. |


### Request header

`Authorization: Bearer [JWT]`

### Request body

`file=@/[path-to]/[file].txt`

### Example request via curl

`curl -H "Authorization: Bearer [JWT]" -F "file=@/[path-to]/[file].txt" https://glowing-palace-179100.appspot.com/upload/[bucket]/[filename]`

### Response

If successful, this method returns a response body with the following structure:

```
{
  "success": true,
  "bucket": [bucketName],
  "filename": "[filename].txt"
}
```

## /download

Download a file from your bucket to your local computer.

### HTTP request URI

`GET https://glowing-palace-179100.appspot.com/download/[bucket]/[filename]`

### Parameters

| Parameter name | Parameter type | Value | Description |
| ----- | ----- | ----- | ----- |
| `bucket` | `path` | `string` | Name of bucket in which to locate file. |
| `filename` | `path` | `string` | Filename including any prefix, i.e. the filepath. |


### Request header

`Authorization: Bearer [JWT]`

### Request body

Do not supply a request body with this method.

### Example request via curl

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/download/[bucket]/[filename]`

### Response

If successful, this method returns a read stream of the contents of the file. 

The stream can be piped to a local destination. For example, to write the contents to a local file:

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/download/[bucket]/[filename] > [localdestination.txt]`

## /share

Share a single file or all files within a directory with a specified collaborator or Google Group.

### HTTP request URI

`GET https://glowing-palace-179100.appspot.com/share/[bucket]/[item]`

### Parameters

| Parameter name | Parameter type | Value | Description |
| ----- | ----- | ----- | ----- |
| `bucket` | `path` | `string` | Name of bucket in which to locate file. |
| `item` | `path` | `string` | Path to the item to be shared. The item can be a file or a directory. |
| `recipient` | `query` | `string` | Gmail address with which to share access to the specified item. |


### Request header

`Authorization: Bearer [JWT]`

### Request body

Do not supply a request body with this method.

### Example request via curl

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/share/[bucket]/[item]?recipient=[recipient]`

### Response

If successful, this method returns a response body with the following structure:

```
{
  "success": true,
  "recipient": "[recipient]",
  "sharedItem": [item]
  "sharedIsFile": [true/false]
  "files": [
    {
      "name": "[filename]",
      "url": "https://storage.cloud.google.com/[bucket]/aq-data/[filename]"
    },

  ...

  ]
}
```

## /revoke

Revoke access from single file or all files within a directory with a specified collaborator or Google Group. 

### HTTP request URI

`GET https://glowing-palace-179100.appspot.com/revoke/[bucket]/[item]`

### Parameters

| Parameter name | Parameter type | Value | Description |
| ----- | ----- | ----- | ----- |
| `bucket` | `path` | `string` | Name of bucket in which to locate file. |
| `item` | `path` | `string` | Path to the item to be revoked from access. The item can be a file or a directory. |
| `recipient` | `query` | `string` | Gmail address from which to revoke access to the specified item. |


### Request header

`Authorization: Bearer [JWT]`

### Request body

Do not supply a request body with this method.

### Example request via curl

`curl -H "Authorization: Bearer [JWT]" https://glowing-palace-179100.appspot.com/revoke/[bucket]/[item]?recipient=[recipient]`

### Response

If successful, this method returns a response body with the following structure:

```
{
  "success": true,
  "recipient": "[recipient]",
  "sharedItem": [item]
  "sharedIsFile": [true/false]
  "files": [
    {
      "name": "[filename]",
      "url": "https://storage.cloud.google.com/[bucket]/aq-data/[filename]"
    },

  ...

  ]
}
```