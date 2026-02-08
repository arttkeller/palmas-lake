"""
Pytest configuration for the API tests.
Configures Hypothesis for faster test execution.
"""
import pytest
from hypothesis import settings, Verbosity, Phase

# Override the default settings to use fewer examples for faster tests
# This will apply to all tests that don't explicitly override max_examples
settings.register_profile(
    "ci",
    max_examples=10,
    deadline=None,
    verbosity=Verbosity.normal,
    suppress_health_check=[],
    phases=[Phase.explicit, Phase.reuse, Phase.generate],
)

# Register a 'dev' profile for development
settings.register_profile(
    "dev",
    max_examples=50,
    deadline=None,
    verbosity=Verbosity.normal,
)

# Register a 'full' profile for comprehensive testing
settings.register_profile(
    "full",
    max_examples=100,
    deadline=None,
    verbosity=Verbosity.normal,
)

# Load the 'ci' profile by default for faster tests
settings.load_profile("ci")

# Force override the default settings
settings._current_profile = "ci"
