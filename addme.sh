#!/bin/bash

NEWUSER=$1

if [ -z "$NEWUSER" ]; then
    echo "Error: Please provide a username as parameter"
    exit 1
fi

sudo adduser --disabled-password --gecos "" $NEWUSER
sudo usermod -aG sudo $NEWUSER

sudo -u $NEWUSER mkdir -p /home/$NEWUSER/.ssh
sudo cp /home/ubuntu/.ssh/authorized_keys /home/$NEWUSER/.ssh/

sudo mkdir -p /data/home/$NEWUSER
sudo ln -s /data/home/$NEWUSER /home/$NEWUSER/work

echo "$NEWUSER ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/$NEWUSER

sudo chown -R $NEWUSER:$NEWUSER /home/$NEWUSER/

sudo chmod 440 /etc/sudoers.d/$NEWUSER
