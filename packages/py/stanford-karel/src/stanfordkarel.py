"""
This file defines the necessary functions and definitions that students must
import in order to be able to write a new Karel program. Any new Karel file
must include the following line:

from stanfordkarel import *

Original Author: Nicholas Bowman
Credits: Kylie Jue, Tyler Yep
License: MIT
Version: 1.0.0
Email: nbowman@stanford.edu
Date of Creation: 10/1/2019
"""

from typing import Callable, Optional

import os
import sys
from pathlib import Path

from canvas import HTMLCanvas
from .karel_program import KarelProgram
from .karel_canvas import KarelCanvas


def __get_world_file() -> str:
    world_file = ""
    student_code_file = Path(sys.argv[0])

    # Special case - if filename matches a specified world name,
    # Set the default world to the world with that name.
    # I personally recommend removing this functionality completely.
    if (
        not world_file
        and (
            Path(__file__).absolute().parent
            / "worlds"
            / student_code_file.with_suffix(".w").name
        ).is_file()
    ):
        world_file = student_code_file.stem

    return world_file

def __get_world_file() -> str:
    def try_find(path: Path) -> Optional[str]:
        if path is None: return None
        return path.as_posix() if path.is_file() else None

    def try_find_any(dir: Path) -> Optional[str]:
        for file in dir.glob("*.w"):
            if file.is_file():
                return file.as_posix()
        return None

    main_file = Path(sys.argv[0]).absolute()
    main_dir = main_file.parent
    worlds_dir = main_dir / "worlds"
    builtin_worlds_dir = Path(__file__).absolute().parent / "worlds"
    filename = f"{main_file.stem}.w"

    # Setting KAREL_WORLD environment variable
    # allows configuring default world
    env_world_path = os.environ.get("KAREL_WORLD")
    env_world_path = Path(env_world_path) if env_world_path else None

    return (
        try_find(env_world_path)
        or try_find(worlds_dir / filename)
        or try_find(main_dir / filename)
        or try_find(builtin_worlds_dir / filename)
        or try_find_any(worlds_dir)
        or try_find_any(main_dir)
        or ""
    )


__karel = KarelProgram(__get_world_file())
__canvas = KarelCanvas(600, 400, world=__karel.world, karel=__karel)


def karel_action_decorator(
    karel_fn: Callable[..., None]
) -> Callable[..., None]:
    def wrapper(*args, **kwargs) -> None:
        # execute Karel function
        karel_fn(*args, **kwargs)
        # redraw canvas with updated state of the world
        __canvas.draw()
        # delay by specified amount
        # TODO: This should be replaced by time.sleep once the environment supports it
        speed = __karel.world.init_speed
        HTMLCanvas.sleep((1 - speed / 100) * 1000)

    return wrapper


@karel_action_decorator
def move() -> None:
    return __karel.move()


@karel_action_decorator
def turn_left() -> None:
    return __karel.turn_left()


@karel_action_decorator
def put_beeper() -> None:
    return __karel.put_beeper()


@karel_action_decorator
def pick_beeper() -> None:
    return __karel.pick_beeper()


@karel_action_decorator
def paint_corner(color: str) -> None:
    return __karel.paint_corner(color)


def front_is_clear() -> bool:
    return __karel.front_is_clear()


def front_is_blocked() -> bool:
    return __karel.front_is_blocked()


def left_is_clear() -> bool:
    return __karel.left_is_clear()


def left_is_blocked() -> bool:
    return __karel.left_is_blocked()


def right_is_clear() -> bool:
    return __karel.right_is_clear()


def right_is_blocked() -> bool:
    return __karel.right_is_blocked()


def beepers_present() -> bool:
    return __karel.beepers_present()


def no_beepers_present() -> bool:
    return __karel.no_beepers_present()


def beepers_in_bag() -> bool:
    return __karel.beepers_in_bag()


def no_beepers_in_bag() -> bool:
    return __karel.no_beepers_in_bag()


def facing_north() -> bool:
    return __karel.facing_north()


def not_facing_north() -> bool:
    return __karel.not_facing_north()


def facing_east() -> bool:
    return __karel.facing_east()


def not_facing_east() -> bool:
    return __karel.not_facing_east()


def facing_west() -> bool:
    return __karel.facing_west()


def not_facing_west() -> bool:
    return __karel.not_facing_west()


def facing_south() -> bool:
    return __karel.facing_south()


def not_facing_south() -> bool:
    return __karel.not_facing_south()


def corner_color_is(color: str) -> bool:
    return __karel.corner_color_is(color)


# Defined constants for ease of use by students when coloring corners
RED = "Red"
BLACK = "Black"
CYAN = "Cyan"
DARK_GRAY = "Dark Gray"
GRAY = "Gray"
GREEN = "Green"
LIGHT_GRAY = "Light Gray"
MAGENTA = "Magenta"
ORANGE = "Orange"
PINK = "Pink"
WHITE = "White"
BLUE = "Blue"
YELLOW = "Yellow"
BLANK = ""
