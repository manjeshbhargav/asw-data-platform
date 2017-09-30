import React, { Component } from 'react';
import { Col, Grid, Row } from 'react-bootstrap';
import Signin from './Signin';
import Topbar from './Topbar';
import './App.css';

class App extends Component {
  render() {
    return (
      <Grid fluid>
        <Row className="show-grid">
          <Col xs={12} md={12}>
            <Topbar brand="ASW Data Platform"
              links={[
                {title: 'About Us', href: '#'},
                {title: 'Contact Us', href: '#'},
              ]} />
          </Col>
        </Row>
        <Row className="show-grid">
          <Col xs={12} md={12}>
            <Signin header="ASW Data Platform" />
          </Col>
        </Row>
      </Grid>
    );
  }
}

export default App;
