#!/bin/bash
set -e

curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
yum install -y nodejs

npm install -g pnpm

pnpm add -g pm2

pm2 startup systemd -u ec2-user --hp /home/ec2-user