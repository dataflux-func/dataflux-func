#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Built-in Modules
import os
import sys
import textwrap
import getpass
import logging
import argparse
import traceback
import pprint

# 3rd-party Modules
import requests

# Project Modules
from worker.utils import yaml_resources, toolkit

BASE_PATH = os.path.dirname(os.path.abspath(__file__))
CONFIG    = yaml_resources.load_config(os.path.join(BASE_PATH, './config.yaml'))

from worker.utils.extra_helpers import RedisHelper, FuncMySQLHelper, FuncPostgreSQLHelper

CACHE_DB = RedisHelper(logging)

DB = None
if CONFIG.get('DB_ENGINE') == 'postgresql':
    DB = FuncPostgreSQLHelper(logging)
else:
    DB = FuncMySQLHelper(logging)

ADMIN_USER_ID     = 'u-admin'
DB_UPGRADE_SEQ_ID = 'UPGRADE_DB_SEQ'

COMMAND_FUNCS = {}

COLOR_MAP = {
    'grey'   : '\033[30m',
    'red'    : '\033[31m',
    'green'  : '\033[32m',
    'yellow' : '\033[33m',
    'blue'   : '\033[34m',
    'magenta': '\033[35m',
    'cyan'   : '\033[36m',
}
def colored(s, color=None):
    if not color:
        color = 'yellow'

    color = COLOR_MAP[color]

    return color + '{}\033[0m'.format(s)

class CommandCanceled(Exception):
    pass

def command(F):
    COMMAND_FUNCS[F.__name__] = F
    return F

def confirm(force=False):
    if force:
        return

    # Confirm
    user_input = input('Are you sure you want to do this? (yes/no): ')
    if user_input != 'yes':
        raise CommandCanceled()

def reset_db_data(table, data):
    try:
        trans_conn = DB.start_trans()

        # Query data
        sql = DB.create_sql_builder()
        sql.SELECT('id')
        sql.FROM(table)
        sql.WHERE({
            'id': data['id'],
        })
        sql.LIMIT(1)

        db_res = DB.trans_query(trans_conn, sql)
        if db_res:
            # Update if exist
            sql = DB.create_sql_builder()
            sql.UPDATE(table)
            sql.SET(data)
            sql.WHERE({
                'id': data['id'],
            })
            sql.LIMIT(1)

            DB.trans_query(trans_conn, sql)

        else:
            # Create new data if it does not exist
            sql = DB.create_sql_builder()
            sql.INSERT_INTO(table)
            sql.VALUES(data)

            DB.trans_query(trans_conn, sql)

    except Exception as e:
        for line in traceback.format_exc().splitlines():
            logging.error(line)

        DB.rollback(trans_conn)

        raise

    else:
        DB.commit(trans_conn)

def run_db_sql(raw_sql):
    try:
        trans_conn = DB.start_trans()

        # Run SQL
        sql = DB.create_sql_builder(raw_sql)
        db_res = DB.trans_query(trans_conn, sql)

        print('DB Result:')
        pprint.pprint(db_res)

    except Exception as e:
        for line in traceback.format_exc().splitlines():
            logging.error(line)

        DB.rollback(trans_conn)

        raise

    else:
        DB.commit(trans_conn)

@command
def reset_admin(options):
    '''
    Reset admin account
    '''
    # Waiting for the user to input data
    username        = options.get('admin_username') or input('Enter new Admin username: ')
    password        = options.get('admin_password') or getpass.getpass(f'Enter new password for [{username}]: ')
    password_repeat = options.get('admin_password') or getpass.getpass('Confirm new password: ')

    if password != password_repeat:
        # Two inputs do not match
        raise Exception('Repeated password not match')

    if not all([username, password]):
        # Empty content exists
        raise Exception('Username or password not inputed.')

    # Generate new admin user data
    str_to_hash = '~{}~{}~{}~'.format(ADMIN_USER_ID, password, CONFIG['SECRET'])
    password_hash = toolkit.get_sha512(str_to_hash)
    data = {
        'id'              : ADMIN_USER_ID,
        'username'        : username,
        'passwordHash'    : password_hash,
        'name'            : 'Administrator',
        'roles'           : 'sa',
        'customPrivileges': '*',
        'isDisabled'      : False,
    }

    # Confirm
    confirm(options.get('force'))

    # Save to DB
    reset_db_data('wat_main_user', data)

@command
def reset_upgrade_db_seq(options):
    '''
    Reset database upgrade SEQ
    '''
    # Waiting for the user to input data
    db_upgrade_seq = input('Enter new DB upgrade SEQ: ')

    # Generate new database SEQ data
    data = {
        'id'   : DB_UPGRADE_SEQ_ID,
        'value': db_upgrade_seq,
    }

    # Confirm
    confirm(options.get('force'))

    # Save to DB
    reset_db_data('wat_main_system_setting', data)

@command
def clear_redis(options):
    '''
    Flush Redis
    '''
    # Confirm
    confirm(options.get('force'))

    # Do flush
    CACHE_DB.client.flushdb()

@command
def run_sql(options):
    '''
    Run SQL
    '''
    # Waiting for the user to input data
    user_input = input('Enter SQL file path, URL or SQL statement: ')

    # Get SQL file
    sql = None

    if user_input.startswith('http://') or user_input.startswith('https://'):
        print(colored('Run SQL from URL'))
        resp = requests.get(user_input)
        resp.raise_for_status()
        sql = resp.text

    else:
        try:
            with open(user_input, 'r') as f:
                print(colored('Run SQL from local file'))
                sql = f.read()

        except FileNotFoundError as e:
            print(colored('Run SQL from user input'))
            sql = user_input

    # Save to DB
    run_db_sql(sql)

def main(options):
    if not CONFIG.get('_IS_INSTALLED') and not CONFIG.get('_DISABLE_SETUP'):
        raise Exception(f"This DataFlux Func is not installed yet, please complete the installation first.\n Default URL is http(s)://<Domain or IP>:{CONFIG.get('WEB_PORT')}/")

    command = options.get('command')
    command_func = COMMAND_FUNCS.get(command)

    if not command_func:
        raise Exception(f"No such command: {command}\n Command should be one of {', '.join(COMMAND_FUNCS.keys())}")

    command_func(options)

def get_options_by_command_line():
    arg_parser = argparse.ArgumentParser(
        prog='admin-tool.py',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent('''
            +--------------------------+
            | DataFlux Func Admin Tool |
            +--------------------------+
            This tool should run in the Docker container:
                $ docker exec {DataFlux Func Container ID} sh -c 'exec python admin-tool.py --help'
                $ docker exec -it {DataFlux Func Container ID} sh -c 'exec python admin-tool.py reset_admin [-f] [--admin-username=<Admin Username>] [--admin-password=<Password>]'
                $ docker exec -it {DataFlux Func Container ID} sh -c 'exec python admin-tool.py reset_upgrade_db_seq'
                $ docker exec -it {DataFlux Func Container ID} sh -c 'exec python admin-tool.py clear_redis'
                $ docker exec -it {DataFlux Func Container ID} sh -c 'exec python admin-tool.py run_sql'
        '''))

    # Command
    arg_parser.add_argument('command', metavar='<Command>', help=', '.join(COMMAND_FUNCS.keys()))

    # Force run
    arg_parser.add_argument('-f', '--force', action='store_true', help='Force run, no confirm')

    # Reset password
    arg_parser.add_argument('--admin-username', dest='admin_username', help='Admin Username')
    arg_parser.add_argument('--admin-password', dest='admin_password', help='Admin Password')

    args = vars(arg_parser.parse_args())
    args = dict(filter(lambda x: x[1] is not None, args.items()))

    return args

if __name__ == '__main__':
    options = get_options_by_command_line()

    try:
        main(options)

    except (KeyboardInterrupt, CommandCanceled) as e:
        print()
        print(colored('Canceled', 'yellow'))

    except Exception as e:
        print(colored(str(e), 'red'))

    else:
        print(colored('Done', 'green'))
