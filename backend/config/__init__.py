"""Application configuration (Laravel's `config/`).

Deliberately exports nothing: re-exporting the `settings` instance here
would shadow the `config.settings` submodule, so `from config import
settings` would silently return the object instead of the module.
"""
