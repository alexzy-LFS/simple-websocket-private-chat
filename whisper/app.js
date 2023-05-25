// Copyright 2018-2020Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
  let connectionData;

  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME, ProjectionExpression: 'connectionId' }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });

  const data = JSON.parse(event.body).data;
  const connectionId = event.requestContext.connectionId;

  try {
    if (!data) {
      //init req
      let peers = await ddb.scan({ TableName: TABLE_NAME, Limit: 2 }).promise();
      peers = peers['Items'];
      if (peers.length > 0 && peers[0].connectionId!=connectionId) {
        await apigwManagementApi.postToConnection({
          ConnectionId: peers[0].connectionId,
          Data: JSON.stringify({ requester: connectionId })
        }).promise();
      } else {
        await apigwManagementApi.postToConnection({
          ConnectionId: connectionId,
          Data: "you are the first here!"
        }).promise();
      }
    } else {
      let { targetId, message } = JSON.parse(data);
      await apigwManagementApi.postToConnection({ ConnectionId: targetId, Data: message }).promise();
    }
  } catch (e) {
    if (e.statusCode === 410) {
      console.log(`Found stale connection, deleting ${connectionId}`);
      await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
    } else {
      return { statusCode: 500, body: e.message };
    }
  }

  return { statusCode: 200, body: 'Data sent.' };
};
