import React from 'react';
import { Nav, Navbar, NavItem } from 'react-bootstrap';

export default function Topbar(props) {
  return (
    <Navbar>
      <Navbar.Header>
        <Navbar.Brand>
          <a href="#">{props.brand}</a>
        </Navbar.Brand>
      </Navbar.Header>
      <Nav>
        {props.links.map((link, i) => {
          return (
            <NavItem eventKey={i} href={link.href}>
              {link.title}
            </NavItem>
          );
        })}
      </Nav>
    </Navbar>
  );
}
