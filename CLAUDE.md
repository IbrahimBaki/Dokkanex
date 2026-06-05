# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment Environment

This project lives at `/home/ibrahim/Desktop/deployment-configuration/www/Dokanex` and is served by a Docker-based stack. All PHP/Artisan/Composer commands must run **inside the container**, not on the host.

**Docker container name:** `azm-php82` (PHP 8.2 + Apache)

```bash
# Start the stack (from /home/ibrahim/Desktop/deployment-configuration/)
docker-compose up -d

# Stop
docker-compose down

# Shell into the PHP container
docker exec -it azm-php82 /bin/bash
```

## Running Commands Inside Docker

Always use `-w` to set the working directory:

```bash
# Artisan
docker exec -it -w /var/www/html/Dokanex azm-php82 php artisan <command>

# Composer
docker exec -it -w /var/www/html/Dokanex azm-php82 composer <command>

# Run tests
docker exec -it -w /var/www/html/Dokanex azm-php82 php artisan test

# Run a single test
docker exec -it -w /var/www/html/Dokanex azm-php82 php artisan test --filter=TestClassName

# Laravel Pint (code style)
docker exec -it -w /var/www/html/Dokanex azm-php82 ./vendor/bin/pint

# Fix permissions after migrations
sudo chmod 777 storage/framework/ -R
sudo chmod 777 storage/logs/ -R
```

## Database

MySQL 8 is available at host `database` (container: `azm-mysql8`) on port 3306.

| Key              | Value       |
|------------------|-------------|
| Host (in Docker) | `database`  |
| Host (on host)   | `127.0.0.1` |
| Database         | `nelc`      |
| User             | `rootuser`  |
| Password         | `nelc@321`  |
| Root password    | `root`      |

## Apache Virtual Host

To expose this project at a local domain, create a vhost config at:
`/home/ibrahim/Desktop/deployment-configuration/config/vhosts/dokanex.localhost.conf`

Pattern (copy from any existing `*.localhost.conf`):
```apache
<VirtualHost *:80>
    ServerName dokanex.localhost
    DocumentRoot ${APACHE_DOCUMENT_ROOT}/Dokanex/public
    <Directory ${APACHE_DOCUMENT_ROOT}/Dokanex/public>
        AllowOverride All
        Order allow,deny
        allow from all
    </Directory>
</VirtualHost>
```

Then add `127.0.0.1 dokanex.localhost` to `/etc/hosts`.

## Multi-Project Context

The `www/` directory is a shared document root. Sibling projects use the same Docker stack:

| Directory       | Domain                    | Stack                              |
|-----------------|---------------------------|------------------------------------|
| `account/`      | `account.localhost`       | Laravel (SSO/auth backend)         |
| `license/`      | `license.localhost`       | Laravel                            |
| `bigdady/`      | `bigdady.localhost`       | Laravel + Filament + nwidart modules |
| `EduPulseProject/EduPulse/` | `edupulse.localhost` | Laravel + Vue 3 + Filament   |
| `GEA/`          | —                         | Laravel + Botble CMS               |
| `admin/`        | `appadmin.localhost`      | Next.js (proxied from port 4000)   |
| `user/`         | `app.localhost`           | Next.js (proxied from port 3000)   |

## Shared Services

- **Mail:** Mailpit at `http://localhost:8025` (SMTP on port 1025)
- **n8n:** Workflow automation at `http://localhost:5678`
- **MCP Server:** Node.js at port 4000

## Deployment Scripts (in `www/`)

| Script                      | Purpose                            |
|-----------------------------|------------------------------------|
| `script.sh`                 | Initial setup for NELC environment |
| `devScript.sh`              | AzM/Ahlan dev environment setup    |
| `stagingScript.sh`          | Staging deploy (built Next.js)     |
| `stagingScriptWithFresh.sh` | Staging deploy with fresh migrate  |
| `testingScript.sh`          | Testing environment setup          |

Scripts clone repos, copy `.env`, run `composer install`, `php artisan migrate`, `php artisan app:install`, and start Next.js frontends.
