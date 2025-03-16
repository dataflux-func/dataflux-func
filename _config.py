# -*- coding: utf-8 -*-

# Built-in Modules
import os
import sys
import argparse

# Disable stdout
class NoOutput(object):
    def nope(self, *args, **kwargs):
        pass

    def __getattr__(self, name):
        return self.nope

def get_options_from_command_line():
    arg_parser = argparse.ArgumentParser(description='DataFlux Func Config Helper')

    # Config key
    arg_parser.add_argument('key', metavar='<Config Key>', help='Config Key to get')

    # Quote
    arg_parser.add_argument('-v', '--verbose', action='store_true', dest='verbose', help='Detailed output')

    args = vars(arg_parser.parse_args())
    args = dict(filter(lambda x: x[1] is not None, args.items()))

    return args

def main(options):
    # Project Modules
    from worker.utils import yaml_resources
    BASE_PATH = os.path.dirname(os.path.abspath(__file__))
    CONFIG    = yaml_resources.load_config(os.path.join(BASE_PATH, './config.yaml'))

    key = options.get('key')
    value = CONFIG.get(key)

    if options.get('verbose'):
        value = '\n'.join([
            f'Key   : {key}',
            f'Value : {repr(value)}',
            f'Type  : {type(value)}',
            f'Length: {len(str(value))}',
            f'Print : {value}',
        ])

    else:
        value = str(value or '')

    print(value, file=sys.__stdout__, flush=True)

if __name__ == '__main__':
    options = get_options_from_command_line()

    sys.stdout = NoOutput()
    main(options)
