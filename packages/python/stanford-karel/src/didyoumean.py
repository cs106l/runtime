"""
This file defines the logic to add suggestions to exceptions.

Original Author: Tyler Yep
Credits: Sylvain Desodt
License: MIT
Version: 1.0.0
Email: tyep@cs.stanford.edu
"""

from __future__ import annotations

import difflib
import itertools
import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator
    from types import FrameType, TracebackType

# To be used in `get_suggestions_for_exception`.
SUGGESTION_FUNCTIONS: dict[Any, list[Any]] = {}
VAR_NAME = r"[^\d\W]\w*"
NAMENOTDEFINED_RE = rf"^(?:global )?name '(?P<name>{VAR_NAME})' is not defined$"


def merge_dict(*dicts: dict[str, Any]) -> dict[str, list[str]]:
    """
    Merge dicts and return a dictionary mapping key to list of values.
    Order of the values corresponds to the order of the original dicts.
    """
    ret: dict[str, list[str]] = {}
    for dict_ in dicts:
        for key, val in dict_.items():
            ret.setdefault(key, []).append(val)
    return ret


def add_scope_to_dict(dict_: dict[str, Any], scope: str) -> dict[str, tuple[Any, str]]:
    """Convert name:obj dict to name: (obj, scope) dict."""
    return {k: (v, scope) for k, v in dict_.items()}


def get_objects_in_frame(frame: FrameType) -> dict[str, list[str]]:
    """Get objects defined in a given frame.

    This includes variable, types, builtins, etc.
    The function returns a dictionary mapping names to a (non empty)
    list of ScopedObj objects in the order following the LEGB Rule.
    """
    return merge_dict(
        add_scope_to_dict(frame.f_locals, "local"),
        add_scope_to_dict(frame.f_globals, "global"),
        add_scope_to_dict(frame.f_builtins, "builtin"),
    )


def register_suggestion_for(
    error_type: type[Exception], regex: str | None
) -> Callable[..., Any]:
    """Decorator to register a function to be called to get suggestions.

    Parameters correspond to the fact that the registration is done for a
    specific error type and if the error message matches a given regex
    (if the regex is None, the error message is assumed to match before being
    retrieved).

    The decorated function is expected to yield any number (0 included) of
    suggestions (as string).
    The parameters are: (value, frame, groups):
     - value: Exception object
     - frame: Last frame of the traceback (may be None when the traceback is
        None which happens only in edge cases)
     - groups: Groups from the error message matched by the error message.
    """

    def internal_decorator(func: Callable[..., list[str]]) -> Callable[..., Any]:
        def registered_function(value: Exception, frame: FrameType) -> list[str]:
            if regex is None:
                return func(value, frame, [])
            error_msg = value.args[0]
            match = re.match(regex, error_msg)
            if match:
                return func(value, frame, match.groups())
            return []

        SUGGESTION_FUNCTIONS.setdefault(error_type, []).append(registered_function)
        return func  # return original function

    return internal_decorator


@register_suggestion_for(NameError, NAMENOTDEFINED_RE)
def suggest_name_not_defined(
    value: Exception, frame: FrameType, groups: tuple[str]
) -> itertools.chain[str]:
    """Get the suggestions for name in case of NameError."""
    del value
    (name,) = groups
    objs = get_objects_in_frame(frame)
    return itertools.chain(suggest_name_as_name_typo(name, objs))


def get_suggestions_for_exception(
    value: Exception, traceback: TracebackType | None
) -> str:
    """Get suggestions for an exception."""
    frame = get_last_frame(traceback)
    suggestions = itertools.chain.from_iterable(
        func(value, frame)
        for error_type, functions in SUGGESTION_FUNCTIONS.items()
        if isinstance(value, error_type)
        for func in functions
    )
    suggestions = list(suggestions)
    if suggestions:
        return f"Did you mean {', '.join(suggestions)}?"
    return ""


def get_close_matches(word: str, possibilities: list[str]) -> list[str]:
    """
    Return a list of the best "good enough" matches.

    Wrapper around difflib.get_close_matches() to be able to
    change default values or implementation details easily.
    """
    return [
        w for w in difflib.get_close_matches(word, possibilities, 3, 0.5) if w != word
    ]


def suggest_name_as_name_typo(name: str, objdict: dict[str, Any]) -> Iterator[str]:
    """Suggest that name could be a typo (misspelled existing name).

    Example: 'foobaf' -> 'foobar'.
    """
    for word in get_close_matches(name, list(objdict)):
        yield f"'{word}'"  # + " (" + objdict[name][0].scope + ")"


def get_last_frame(traceback: TracebackType | None) -> FrameType | None:
    """Extract last frame from a traceback."""
    # In some rare case, the given traceback might be None
    if traceback is None:
        return None
    while traceback.tb_next:
        traceback = traceback.tb_next
    return traceback.tb_frame


def raise_did_you_mean(e: Exception) -> None:
    """Hook to be substituted to sys.excepthook to enhance exceptions."""
    if isinstance(e, NameError):
        suggestions = get_suggestions_for_exception(e, e.__traceback__)
        if suggestions:
            raise Exception(suggestions) from e
    raise e
