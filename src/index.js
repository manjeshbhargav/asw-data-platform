import React from 'react';
import ReactDOM from 'react-dom';
import { parse } from 'querystring';
import './index.css';
import App from './components/App';

const queryString = window.location.href.split('?')[1] || 'state=signin';
const { state } = parse(queryString);
ReactDOM.render(<App state={state}/>, document.getElementById('root'));
