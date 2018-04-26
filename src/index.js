import React from 'react';
import ReactDOM from 'react-dom';
import { parse } from 'querystring';
import './index.css';
import App from './components/App';
import Platform from './components/Platform';

const queryString = window.location.href.split('?')[1] || 'state=signin';
const { b, state, t } = parse(queryString);

const content = {
  directories: [
    'aq-data/test1/',
    'aq-data/test2/',
    'aq-data/test3/'
  ],
  files: [
    {
      name: 'foo.html',
      metadata: {
        contentType: 'text/html',
        updated: new Date().toString(),
        storageClass: 'STANDARD',
        size: 112375
      }
    },
    {
      name: 'bar.txt',
      metadata: {
        contentType: 'text',
        updated: new Date().toString(),
        storageClass: 'STANDARD',
        size: 12345
      }
    },
    {
      name: 'baz.gzip',
      metadata: {
        contentType: 'application/gzip',
        updated: new Date().toString(),
        storageClass: 'STANDARD',
        size: 23456
      }
    }
  ]
};

ReactDOM.render(state === 'signin'
  ? <App state={state}/>
  : <Platform content={content}/>, document.getElementById('root'));
