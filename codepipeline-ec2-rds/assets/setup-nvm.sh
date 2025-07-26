#!/bin/bash
yum update -y

# export HOME="/home/ec2-user"
# export NVM_DIR="$HOME/.nvm"

# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# . "$NVM_DIR/nvm.sh"

runuser -l "ec2-user" -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash'
