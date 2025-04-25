# Local DNS Setup Guide

This guide will help you set up your local DNS configuration to work with the platform's custom domain feature. By following these steps, you'll be able to access your deployed applications using `.platform.test` domains instead of relying on external services like nip.io.

## Overview

The serverless platform now uses a local DNS solution for domain name resolution. This allows you to:

- Access your applications using domains like `myapp.platform.test`
- Work completely offline without external dependencies
- Have full control over your DNS configuration

## Setup Instructions

### 1. Configure Your System's DNS Settings

You need to configure your system to resolve `.platform.test` domains to your local machine. The instructions vary by operating system:

#### macOS

macOS requires a special setup due to how it handles DNS resolution:

1. Install dnsmasq using Homebrew:

```bash
brew install dnsmasq
```

2. Configure dnsmasq to resolve `.platform.test` domains to your local machine:

```bash
echo "address=/platform.test/127.0.0.1" > /opt/homebrew/etc/dnsmasq.conf
```

3. Start dnsmasq service:

```bash
sudo brew services start dnsmasq
```

4. Create a resolver configuration for `.platform.test`:

```bash
sudo mkdir -p /etc/resolver
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/platform.test
```

5. Flush DNS cache:

```bash
sudo killall -HUP mDNSResponder
```

#### Linux

1. Install dnsmasq:

```bash
sudo apt-get install dnsmasq  # For Debian/Ubuntu
# or
sudo yum install dnsmasq      # For CentOS/RHEL/Fedora
```

2. Configure dnsmasq to resolve `.platform.test` domains:

```bash
echo "address=/platform.test/127.0.0.1" | sudo tee -a /etc/dnsmasq.conf
```

3. Restart dnsmasq:

```bash
sudo systemctl restart dnsmasq
```

4. Configure your system to use dnsmasq for DNS resolution:

```bash
# For systems using NetworkManager
echo "[main]
dns=dnsmasq" | sudo tee /etc/NetworkManager/conf.d/dnsmasq.conf
sudo systemctl restart NetworkManager

# For systems using systemd-resolved
sudo mkdir -p /etc/systemd/resolved.conf.d/
echo "[Resolve]
DNS=127.0.0.1
Domains=~platform.test" | sudo tee /etc/systemd/resolved.conf.d/platform-test.conf
sudo systemctl restart systemd-resolved
```

#### Windows

1. Install Acrylic DNS Proxy (a local DNS proxy similar to dnsmasq):
   - Download from: https://mayakron.altervista.org/support/acrylic/Home.htm
   - Install following the instructions

2. Configure Acrylic to resolve `.platform.test` domains:
   - Edit the AcrylicHosts.txt file (typically in C:\Program Files\Acrylic DNS Proxy)
   - Add the following line: `127.0.0.1 *.platform.test`

3. Restart the Acrylic DNS Proxy service

4. Configure Windows to use Acrylic as your DNS server:
   - Set your network adapter's DNS server to 127.0.0.1

5. Flush DNS cache:

```powershell
ipconfig /flushdns
```

### 2. Start the Platform

After configuring your DNS settings, start the platform:

```bash
cd platform-repository
docker-compose up -d
```

### 3. Verify the Setup

To verify that your DNS configuration is working correctly:

1. Test DNS resolution with ping:

```bash
ping -c 3 test.platform.test
```

You should see responses from 127.0.0.1, confirming that the DNS resolution is working.

2. Deploy a project to the platform

3. Check the project details to get the assigned domain (e.g., `myproject.platform.test`)

4. Try to access the domain in your browser

You can also test the DNS resolution using the `dig` or `nslookup` commands:

```bash
# Using dig
dig @127.0.0.1 test.platform.test

# Using nslookup
nslookup test.platform.test 127.0.0.1
```

## Troubleshooting

### Cannot resolve `.platform.test` domains

1. Make sure dnsmasq is running:

```bash
# macOS
brew services list | grep dnsmasq

# Linux
systemctl status dnsmasq
```

2. Check the dnsmasq configuration:

```bash
# macOS
cat /opt/homebrew/etc/dnsmasq.conf

# Linux
cat /etc/dnsmasq.conf
```

3. Verify your resolver configuration:

```bash
# macOS
cat /etc/resolver/platform.test

# Linux
cat /etc/resolv.conf
```

4. Test direct DNS resolution:

```bash
dig @127.0.0.1 test.platform.test
```

### Port 53 conflicts

If dnsmasq fails to start due to port 53 being in use:

1. Find out what's using port 53:

```bash
sudo lsof -i :53
```

2. On Linux, if systemd-resolved is using port 53, you can configure it to free up the port:

```bash
sudo mkdir -p /etc/systemd/resolved.conf.d/
echo "[Resolve]\nDNSStubListener=no" | sudo tee /etc/systemd/resolved.conf.d/no-stub-listener.conf
sudo systemctl restart systemd-resolved
```

3. On macOS, you might need to check for other DNS services:

```bash
sudo brew services stop dnsmasq
sudo lsof -i :53  # Check what else is using port 53
# Address the conflicting service, then restart dnsmasq
sudo brew services start dnsmasq
```

## Advanced Configuration

### Custom Domain Names

If you want to use a different domain instead of `.platform.test`:

1. Update the dnsmasq configuration to use your preferred domain:

```bash
echo "address=/your-domain.test/127.0.0.1" > /opt/homebrew/etc/dnsmasq.conf
```

2. Create a resolver configuration for your domain:

```bash
sudo mkdir -p /etc/resolver
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/your-domain.test
```

3. Update the domain generation in the project orchestrator code (in `proxy/nginx.go`)

4. Restart dnsmasq and flush your DNS cache

## Further Reading

- [Dnsmasq Documentation](http://www.thekelleys.org.uk/dnsmasq/doc.html)
- [DNS Configuration Best Practices](https://www.cloudflare.com/learning/dns/dns-records/)
- [macOS DNS Resolution](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/NetworkingOverview/UnderstandingandPreparingfortheIPv6Transition/UnderstandingandPreparingfortheIPv6Transition.html)
