# -*- coding: utf-8 -*-

# Built-in Modules
import os
import sys
import re

# Project Modules
from worker.utils import toolkit

# 3rd-party Modules
import six
import yaml
import requests

if six.PY2:
    FILE_OPEN_KWARGS = {}
else:
    FILE_OPEN_KWARGS = dict(encoding='utf8')

FILE_CACHE = {}

# Init
CONFIG_KEY           = 'CONFIG'
CONFIG_FILE_PATH_KEY = 'CONFIG_FILE_PATH'
PRINT_DETAIL         = sys.argv[0] in ('worker/app.py', 'worker/beat.py')

INVISIBLE_CHAR_CHECKED = False
INVISIBLE_CHAR_CHECK_FIELD_PATTERNS = [
    r'.+_HOST$',
    r'.+_PORT$',
    r'.+_USER$',
    r'.+_PASSWORD$',
    r'.+_DATABASE$',
]

def _warn_invisible_char_in_config(config):
    # Only check once
    global INVISIBLE_CHAR_CHECKED
    if INVISIBLE_CHAR_CHECKED:
        return

    INVISIBLE_CHAR_CHECKED = True

    for k, v in config.items():
        if not isinstance(v, str):
            continue

        for pattern in INVISIBLE_CHAR_CHECK_FIELD_PATTERNS:
            if re.match(pattern, k):
                m = re.search(r'\s', v)
                if m:
                    print(f"[CONFIG WARNING] The value of config `{k}` contains a INVISIBLE char, please make sure it's correct.")
                    break

def load_file(key, file_path):
    obj = None
    with open(file_path, 'r', **FILE_OPEN_KWARGS) as _f:
        file_content = _f.read()
        obj = yaml.safe_load(file_content)

    if key in FILE_CACHE:
        FILE_CACHE[key].update(obj)
    else:
        FILE_CACHE[key] = obj

    return obj

def load_config(config_file_path):
    config_obj = load_file(CONFIG_KEY, config_file_path)
    config_from_env_prefix   = config_obj['CONFIG_FROM_ENV_PREFIX']
    config_for_custom_prefix = config_obj['CUSTOM_CONFIG_PREFIX']

    # Collect config field type map
    config_type_map = {}
    for k, v in config_obj.items():
        if v is True or v is False:
            config_type_map[k] = 'boolean'

        elif isinstance(v, int):
            config_type_map[k] = 'integer'

        elif isinstance(v, float):
            config_type_map[k] = 'float'

        else:
            if k.endswith('_LIST') or isinstance(v, (list, tuple)):
                config_type_map[k] = 'list'

            elif k.endswith('_MAP') or isinstance(v, dict):
                config_type_map[k] = 'map'

            else:
                config_type_map[k] = 'string'

    # Load user config
    user_config_path = os.environ.get(f'{config_from_env_prefix}{CONFIG_FILE_PATH_KEY}') or config_obj.get(CONFIG_FILE_PATH_KEY)
    if not user_config_path:
        # User config path NOT SET
        if PRINT_DETAIL:
            print('[YAML Resource] ENV `CONFIG_FILE_PATH` not set. Use default config')

    else:
        # User config from FILE
        if not os.path.exists(user_config_path):
            if PRINT_DETAIL:
                print('[YAML Resource] Config file `{}` not found. Use default config.'.format(user_config_path))

        else:
            user_config_obj = None
            with open(user_config_path, 'r', **FILE_OPEN_KWARGS) as _f:
                user_config_content = _f.read()
                user_config_obj = yaml.safe_load(user_config_content)

            config_obj.update(user_config_obj)

            if PRINT_DETAIL:
                print('[YAML Resource] Config Overrided by: `{}`'.format(user_config_path))

    # User config from env
    for env_k, v in os.environ.items():
        if not env_k.startswith(config_from_env_prefix):
            continue

        k = env_k[len(config_from_env_prefix):]

        if isinstance(v, str) and v.strip() == '':
            continue

        if k in config_obj:
            # Config override
            config_obj[k] = v
            if PRINT_DETAIL:
                print('[YAML Resource] Config item `{}` Overrided by env.'.format(k))

        elif k.startswith(config_for_custom_prefix):
            # Custom config
            config_obj[k] = v
            if PRINT_DETAIL:
                print('[YAML Resource] Custom config item `{}` added by env.'.format(k))

    # Convert config value type
    for k, v in config_obj.items():
        type_ = config_type_map.get(k)

        if not type_:
            continue

        if v is None:
            if type_ == 'boolean':
                config_obj[k] = False

            elif type_ == 'integer':
                config_obj[k] = 0

            elif type_ == 'float':
                config_obj[k] = 0.0

            elif type_ == 'list':
                config_obj[k] = []

            elif type_ == 'map':
                config_obj[k] = {}

            elif type_ == 'string':
                config_obj[k] = ''

            continue

        if type_ == 'boolean':
            config_obj[k] = toolkit.to_boolean(v)

        elif type_ == 'integer':
            config_obj[k] = int(v)

        elif type_ == 'float':
            config_obj[k] = float(v)

        elif type_ == 'list' and not isinstance(v, (tuple, list)):
            v = str(v)
            if len(v) > 0:
                config_obj[k] = list(map(lambda x: x.strip(), v.split(',')))
            else:
                config_obj[k] = []

        elif type_ == 'map' and not isinstance(v, dict):
            item_map = {}
            for item in v.split(','):
                item_parts = item.split('=')
                item_k = item_parts[0].strip()
                item_v = ''
                if len(item_parts) > 1:
                    item_v = item_parts[1].strip()
                item_map[item_k] = item_v

            config_obj[k] = item_map

        elif type_ == 'string':
            config_obj[k] = str(v)

    # Remap
    if config_obj.get('__REMAP'):
        for _from, _to in config_obj['__REMAP'].items():
            config_obj[_to] = config_obj.pop(_from, None)

    # Cache
    if CONFIG_KEY in FILE_CACHE:
        FILE_CACHE[CONFIG_KEY].update(config_obj)
    else:
        FILE_CACHE[CONFIG_KEY] = config_obj

    _warn_invisible_char_in_config(config_obj)

    return config_obj

def get(key):
    key = key.replace('.yaml', '')
    resource = FILE_CACHE.get(key)

    return resource

def set_value(key, path, value):
    FILE_CACHE[key][path] = value

def get_all():
    return FILE_CACHE
