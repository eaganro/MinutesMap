import sys
import os
import pytest
import importlib.util

# Add lambda directories to sys.path
# Required for 'nba-game-poller' because it has a package structure we import from directly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../nba-game-poller")))

# Note: Other lambda directories are not added to sys.path to avoid namespace collisions
# since they all contain 'lambda_function.py'. We use the 'lambda_loader' fixture below instead.

@pytest.fixture(scope="module")
def aws_credentials():
    """Mocked AWS Credentials for moto."""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"

@pytest.fixture(scope="session")
def lambda_loader():
    """
    Fixture that returns a function to load a lambda module dynamically.
    Usage:
        module = lambda_loader(path_to_lambda_file, module_name_to_assign)
    """
    def _load(path, name):
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    return _load