
ASW Data Platform API
=================

Kenneth Qin for Environmental Defense Fund, 2018

## Authentication by JSON Web Token

All calls require authentication via a JSON Web Token (JWT),
which can be retrieved by first authenticating via the browser at the
application website, e.g. glowing-palace-179100.appspot.com, and then
navigating to the file "system/jwt".

Verify that the JWT is not expired (replace [JWT] wherever you see it with your own JWT)

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/authcheck`

Example JWT (for demonstrating what a JWT looks like; will return Unauthorized error)

`curl -H 'Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE1MTYxNDA1MjcsImV4cCI6MTU0NzY3NjUyNywiYXVkIjoiIiwic3ViIjoiIiwiaWQiOiI0MzIxNTA4MzI1OTEwOCIsImVtYWlsIjoidGVzdDEyM0BnbWFpbC5jb20ifQ.TGZeNm0p-V6229tuiXxZtT_W4SMjm3CX31s4KHeqKZo' https://glowing-palace-179100.appspot.com/authcheck`

## Listing files

List files in your bucket, optionally filtering by a prefix
`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/list/`

List only files matching a prefix, e.g. "test"
`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/list/test`


## Uploading files

Upload a tab-delimited .txt file to your bucket's aq-data folder
Note: must have valid header, or else it will be rejected

`curl -H 'Authorization: Bearer [JWT]' -F "file=@/Users/me/Downloads/upload-valid.txt" https://glowing-palace-179100.appspot.com/upload`


## Downloading files

Download a file from your bucket (prints to console)

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/download/data/upload-valid.txt`


## Sharing files

Share files matching a specified prefix (i.e. could specify a "folder")
with a specified collaborator

Can also specify a folder, e.g. "aq-data"

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/share/aq-data?recipient=test123@gmail.com`

Or a sub-folder, e.g. "aq-data/test"

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/share/aq-data/test?recipient=test123@gmail.com`

Or a file, e.g. "data/folder/test/test1.txt"

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/share/aq-data/test/test1.txt?recipient=test123@gmail.com`


## Revoke sharing privileges

Revoke sharing privileges from a specified collaborator

Revoke all access

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/revoke/aq-data?recipient=test123@gmail.com`

Or a sub-folder, e.g. "aq-data/test"

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/revoke/aq-data/test?recipient=test123@gmail.com`

Or a file, e.g. "data/folder/test/test1.txt"

`curl -H 'Authorization: Bearer [JWT]' https://glowing-palace-179100.appspot.com/revoke/aq-data/test/test1.txt?recipient=test123@gmail.com`
