import React from 'react';
import Table, {
  TableBody,
  TableHeader,
  TableHeaderColumn,
  TableRow,
  TableRowColumn
} from 'material-ui/Table';

import './Browser.css';

function renderFile(file) {
  return (
    <TableRow title={file.name}>
      <TableRowColumn className={'Browser-column-name'}>
        {file.name}
      </TableRowColumn>
      <TableRowColumn>
        {file.metadata.size}
      </TableRowColumn>
      <TableRowColumn>
        {file.metadata.contentType}
      </TableRowColumn>
      <TableRowColumn>
        {file.metadata.storageClass.toLowerCase()}
      </TableRowColumn>
      <TableRowColumn className={'Browser-column-date'}>
        {file.metadata.updated === '-'
          ? file.metadata.updated
          : new Date(file.metadata.updated).toLocaleString()}
      </TableRowColumn>
    </TableRow>
  );
}

function renderFolder(folder) {
  return renderFile({
    metadata: {
      contentType: 'folder',
      size: '-',
      storageClass: '-',
      updated: '-'
    },
    name: folder.replace(/\/$/, '').split('/').pop() + '/'
  });
}

export default function Browser(props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHeaderColumn className={'Browser-column-name'}>
            Name
          </TableHeaderColumn>
          <TableHeaderColumn>
            Size (kb)
          </TableHeaderColumn>
          <TableHeaderColumn>
            Type
          </TableHeaderColumn>
          <TableHeaderColumn>
            Storage class
          </TableHeaderColumn>
          <TableHeaderColumn className={'Browser-column-date'}>
            Last modified
          </TableHeaderColumn>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.content.directories.map(renderFolder)}
        {props.content.files.map(renderFile)}
      </TableBody>
    </Table>
  );
}
