# Tailscale Flatcar Config Tool with AdGuard Home

https://goktughrgnr.github.io/tailscale-flatcar-config-tool-with-adguard/

Enhanced version of the original [Tailscale Flatcar Config Tool](https://jakelmg.github.io/tailscale-flatcar-config-tool/) with AdGuard Home DNS integration. This tool generates Ignition configuration files for Flatcar Linux with Tailscale VPN and AdGuard Home DNS filtering capabilities.

## Features

- Generates Ignition configuration for Flatcar Linux
- Configures Tailscale with exit node capability
- Sets up automatic OS updates with configurable reboot windows
- Configures SSH access with your public key
- **AdGuard Home DNS Integration**: Configure your Flatcar Linux to use AdGuard Home as DNS server
- Automatically advertises DNS routes through Tailscale

## How to Use

1. Enter your Tailscale Auth Key
2. Enable AdGuard Home DNS and enter your AdGuard Home Tailscale IP address
3. Optionally configure SSH access, timezone, and update settings
4. Click "Generate Config" to download the Ignition configuration file
5. Use the generated file to provision your Flatcar Linux server

## Credits

This tool is a fork of [jakelmg/tailscale-flatcar-config-tool](https://github.com/jakelmg/tailscale-flatcar-config-tool) with added AdGuard Home DNS integration.
