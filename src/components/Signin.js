import React from 'react';
import { Alert, Button, Image, Jumbotron } from 'react-bootstrap';
import './Signin.css';

export default function Signin(props) {
  return (
    <Jumbotron className="Signin">
      <h1>{props.header}</h1>
      <Button bsSize="large">
        Sign in using
        <Image src="./google.png" className="Signin-button-logo"/>
      </Button>
    </Jumbotron>
  );
}

export function Status(props) {
  return props.state === 'signinFailed' ? (
    <Alert bsStyle="danger" className="Signin-status">
      <h4>Sign in failed. Try again.</h4>
    </Alert>
  ) : null;
}
