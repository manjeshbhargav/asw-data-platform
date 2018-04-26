import React from 'react';
import AppBar from 'material-ui/AppBar';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import Browser from './Browser';

export default function Platform(props) {
  return (
    <MuiThemeProvider>
      <AppBar title={'ASW Data Platform'}/>
      <Browser content={props.content}/>
    </MuiThemeProvider>
  );
}
