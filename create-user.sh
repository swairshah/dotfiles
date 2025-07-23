#!/bin/bash

# Script to create a new user on Ubuntu or Amazon Linux AWS instances
# Usage: ./create-user.sh <username>

set -e

# Check if username is provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <username>"
    echo "Example: $0 newuser"
    exit 1
fi

USERNAME="$1"

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo "Error: Cannot detect OS"
        exit 1
    fi
}

# Create user with home directory
create_user() {
    echo "Creating user: $USERNAME"
    
    # Check if user already exists
    if id "$USERNAME" &>/dev/null; then
        echo "Warning: User $USERNAME already exists"
        return 0
    fi
    
    # Create user with home directory and bash shell
    useradd -m -s /bin/bash "$USERNAME"
    
    echo "User $USERNAME created successfully"
}

# Add user to sudoers
add_to_sudoers() {
    echo "Adding $USERNAME to sudoers"
    
    case "$OS" in
        "ubuntu")
            # Add user to sudo group
            usermod -aG sudo "$USERNAME"
            echo "User $USERNAME added to sudo group"
            ;;
        "amzn")
            # Amazon Linux - add to wheel group
            usermod -aG wheel "$USERNAME"
            echo "User $USERNAME added to wheel group"
            ;;
        *)
            echo "Warning: Unknown OS ($OS). Attempting to add to both sudo and wheel groups..."
            usermod -aG sudo "$USERNAME" 2>/dev/null || true
            usermod -aG wheel "$USERNAME" 2>/dev/null || true
            ;;
    esac
}

# Set up SSH directory and copy authorized_keys from default user
setup_ssh() {
    USER_HOME="/home/$USERNAME"
    SSH_DIR="$USER_HOME/.ssh"
    
    echo "Setting up SSH directory for $USERNAME"
    
    # Create .ssh directory
    mkdir -p "$SSH_DIR"
    
    # Determine default user based on OS and copy their authorized_keys
    case "$OS" in
        "ubuntu")
            DEFAULT_USER="ubuntu"
            ;;
        "amzn")
            DEFAULT_USER="ec2-user"
            ;;
        *)
            # Try both ubuntu and ec2-user
            if [ -f "/home/ubuntu/.ssh/authorized_keys" ]; then
                DEFAULT_USER="ubuntu"
            elif [ -f "/home/ec2-user/.ssh/authorized_keys" ]; then
                DEFAULT_USER="ec2-user"
            else
                echo "Warning: No default user authorized_keys found"
                DEFAULT_USER=""
            fi
            ;;
    esac
    
    # Copy authorized_keys from default user if it exists
    if [ -n "$DEFAULT_USER" ] && [ -f "/home/$DEFAULT_USER/.ssh/authorized_keys" ]; then
        echo "Copying SSH keys from $DEFAULT_USER to $USERNAME"
        cp "/home/$DEFAULT_USER/.ssh/authorized_keys" "$SSH_DIR/authorized_keys"
        echo "SSH keys copied successfully"
    else
        echo "Warning: No authorized_keys found for default user, creating empty file"
        touch "$SSH_DIR/authorized_keys"
    fi
    
    # Set proper ownership and permissions
    chown "$USERNAME:$USERNAME" "$USER_HOME"
    chown -R "$USERNAME:$USERNAME" "$SSH_DIR"
    chmod 700 "$SSH_DIR"
    chmod 600 "$SSH_DIR/authorized_keys"
    
    echo "SSH directory setup complete"
}

# Main execution
main() {
    echo "Starting user creation process..."
    
    detect_os
    echo "Detected OS: $OS"
    
    create_user
    add_to_sudoers
    setup_ssh
    
    echo ""
    echo "✓ User setup complete!"
    echo "✓ Username: $USERNAME"
    echo "✓ Home directory: /home/$USERNAME"
    echo "✓ SSH directory: /home/$USERNAME/.ssh"
    echo "✓ Sudo access: Enabled"
    echo ""
    echo "Next steps:"
    echo "1. Set password: passwd $USERNAME"
    echo "2. Test SSH access: ssh -i ~/.ssh/your-key.pem $USERNAME@server-ip"
    echo "3. Test sudo access: su - $USERNAME"
}

main