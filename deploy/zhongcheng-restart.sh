#!/bin/sh
set -eu

# Install as root-owned /usr/local/sbin/zhongcheng-restart and allow only this
# fixed command through sudoers for the dedicated deployment account.
exec /usr/bin/systemctl restart zhongcheng-used-cars.service
