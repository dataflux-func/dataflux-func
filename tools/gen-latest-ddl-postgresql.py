import os
import json
import argparse
import re

OPTIONS = None

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

def get_options_by_command_line():
    global OPTIONS

    arg_parser = argparse.ArgumentParser(description='Traditional Chinese Translation Generator')

    args = vars(arg_parser.parse_args())
    args = dict(filter(lambda x: x[1] is not None, args.items()))

    OPTIONS = args

LATEST_DDL_MYSQL      = 'db/dataflux_func_mysql_latest.sql'
LATEST_DDL_POSTGRESQL = 'db/dataflux_func_postgresql_latest.sql'

def gen_latest_ddl_postgresql():
    # MySQL DDL
    mysql_ddl = None
    with open(LATEST_DDL_MYSQL, 'r') as _f:
        mysql_ddl = _f.read()

    pg_ddl = mysql_ddl

    # Add PK seq
    pg_ddl = pg_ddl.replace(
        '''`seq` bigint(20) unsigned NOT NULL AUTO_INCREMENT''',
        '''"seq" BIGSERIAL NOT NULL'''
    )

    # Remove CHARACTER SET
    pg_ddl = pg_ddl.replace(''' CHARACTER SET utf8mb4 COLLATE utf8mb4_bin''', '')

    # Convert bool type
    pg_ddl = re.sub(r' tinyint\(\d+\)', ' SMALLINT', pg_ddl)

    # Convert int type
    pg_ddl = re.sub(r' ([a-zA-Z]*)int\(\d+\)', lambda x: f' {x.group(1).upper()}INT', pg_ddl)

    # Remove unsigned
    pg_ddl = pg_ddl.replace(' unsigned', '')

    # Convert TEXT type
    pg_ddl = pg_ddl.replace(' longtext', ' TEXT')

    # Remove comments
    pg_ddl = re.sub(r" COMMENT '.+',", ',', pg_ddl)

    # Remove table engine config
    pg_ddl = re.sub(r" ENGINE=.+;", ';', pg_ddl)

    # Convert field / table name quoter (`xxx` -> "xxx")
    pg_ddl = re.sub(r'`([0-9a-zA-Z_]+)`', '"\\1"', pg_ddl)

    # Convert quote escape (\' -> '')
    pg_ddl = pg_ddl.replace("\\'", "''")

    ### Handle line by line
    current_table = None
    table_keys    = []

    pg_ddl_lines = []
    for line in pg_ddl.splitlines():
        line = line.rstrip()

        # Enter CREATE TABLE statement block
        if not current_table and line.startswith('CREATE TABLE '):
            m = re.search(r'CREATE TABLE "(\w+)"', line)
            if m:
                current_table = m[1]
                print(f'Enter table {current_table}')

        if not line:
            # Blank line
            pg_ddl_lines.append(line)

        elif line.strip().startswith('KEY "') or line.strip().startswith('UNIQUE KEY "'):
            # Index
            m = re.search(r'((UNIQUE )?KEY) "(\w+)" \(([ ",\w]+)\)', line)
            if m:
                table_keys.append({
                    'type'  : m[1],
                    'name'  : m[3],
                    'fields': m[4],
                })

        else:
            pg_ddl_lines.append(line)

        # Leave CREATE TABLE statement block
        if line.strip() == ');':
            if table_keys:
                for key in table_keys:
                    index_type = key['type'].replace('KEY', 'INDEX')
                    pg_ddl_lines.append(f'''CREATE {index_type} "{current_table}_{key['name']}" ON "{current_table}" ({key['fields']});''')

            print(f'--> Leave table {current_table}')

            current_table = None
            table_keys    = []

    with open(LATEST_DDL_POSTGRESQL, 'w') as _f:
        pg_ddl = '\n'.join(pg_ddl_lines)

        # Remove ddl ending
        pg_ddl = pg_ddl.replace(',\n);', '\n);')

        # Ensure last blank line
        pg_ddl = pg_ddl.strip() + '\n'

        _f.write(pg_ddl)

def main():
    get_options_by_command_line()

    gen_latest_ddl_postgresql()

if __name__ == '__main__':
    print(colored('Gen latest DDL for PostgreSQL', 'green'))
    main()
    print(colored('Done', 'green'))
