function call(endpoint, bucket, path, token) {
  return fetch(endpoint + '/' + bucket + '/' + path, {
    headers: new Headers({
      Authorization: 'Bearer ' + token
    })
  });
}

export function download(bucket, path, token) {
  return call('/download', bucket, path, token).then(response => {
    return response.blob();
  });
}

export function list(bucket, path, token) {
  return call('/list', bucket, path, token).then(response => {
    return response.json();
  });
}
