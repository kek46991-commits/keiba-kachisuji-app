#!/bin/sh
# DATABASE_URL が未設定の場合のみ、同一コンテナ内の MariaDB を起動して使う。
# コンテナ再起動でデータは失われるため、永続化する場合は外部MySQLの DATABASE_URL を設定する。
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL is unset: starting bundled MariaDB"

  mkdir -p /run/mysqld /var/lib/mysql
  chown -R mysql:mysql /run/mysqld /var/lib/mysql

  if [ ! -d /var/lib/mysql/mysql ]; then
    mariadb-install-db --user=mysql --datadir=/var/lib/mysql --auth-root-authentication-method=normal >/dev/null
  fi

  mariadbd --user=mysql --datadir=/var/lib/mysql \
    --bind-address=127.0.0.1 --skip-name-resolve \
    --innodb-buffer-pool-size=48M --performance-schema=OFF &

  for _ in $(seq 1 60); do
    if mariadb-admin ping --silent 2>/dev/null; then break; fi
    sleep 1
  done

  mariadb -e "CREATE DATABASE IF NOT EXISTS keiba CHARACTER SET utf8mb4;"
  mariadb -e "CREATE USER IF NOT EXISTS 'keiba'@'127.0.0.1' IDENTIFIED BY 'keiba'; GRANT ALL ON keiba.* TO 'keiba'@'127.0.0.1'; FLUSH PRIVILEGES;"

  export DATABASE_URL="mysql://keiba:keiba@127.0.0.1:3306/keiba"
  BUNDLED_DB=1
fi

# 生成済みマイグレーションのジャーナルは初期2件のみで最新スキーマを再現できないため、
# schema.ts を正とする push で反映する。
echo "[entrypoint] applying schema"
pnpm exec drizzle-kit push --force

if [ "$BUNDLED_DB" = "1" ]; then
  echo "[entrypoint] seeding demo data"
  pnpm exec tsx local_seed.ts || echo "[entrypoint] local_seed skipped"
  pnpm exec tsx local_result_seed.ts || echo "[entrypoint] local_result_seed skipped"
fi

exec node dist/index.js
