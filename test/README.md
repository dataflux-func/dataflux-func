# DataFlux Func Test Case

DataFlux Func should be ran before executing the test cases.

The test cases use `admin` user (password `admin`) to access `http://localhost:8088` by default.

## How to run

```shell
# Install requirements for the test cases
pip install -r requestments-test.txt

# Enter the test directory to run test
pytest    # run all the test cases
pytest -x # run all the test cases and break on any test case fails
```
