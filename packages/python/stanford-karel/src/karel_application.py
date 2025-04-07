"""
This file defines the GUI for running Karel programs.

Original Author: Nicholas Bowman
Credits: Kylie Jue, Tyler Yep
License: MIT
Version: 1.0.0
Email: nbowman@stanford.edu
Date of Creation: 10/1/2019
"""

from __future__ import annotations

import importlib.util
from importlib.machinery import SourceFileLoader
import inspect
import traceback as tb
from pathlib import Path
from types import FrameType, ModuleType
from typing import TYPE_CHECKING, Any, cast

from .didyoumean import add_did_you_mean
from .karel_canvas import KarelCanvas
from .karel_program import KarelException, KarelProgram

if TYPE_CHECKING:
    from collections.abc import Callable

from canvas import HTMLCanvas

class StudentModule(ModuleType):
    move: Any
    turn_left: Any
    put_beeper: Any
    pick_beeper: Any
    paint_corner: Any

    @staticmethod
    def main() -> None:
        raise NotImplementedError


class StudentCode:
    """
    This process extracts a module from an arbitary file that contains student code.
    https://stackoverflow.com/questions/67631/how-to-import-a-module-given-the-full-path
    """

    def __init__(self, code_file: Path) -> None:
        if not code_file.is_file():
            raise FileNotFoundError(f"{code_file} could not be found.")

        self.module_name = code_file.stem
        loader = SourceFileLoader(self.module_name, code_file.as_posix())
        spec = importlib.util.spec_from_loader(self.module_name, loader)

        assert spec is not None
        try:
            module_loader = spec.loader
            assert module_loader is not None
            mod = cast("StudentModule", importlib.util.module_from_spec(spec))
            self.mods: list[StudentModule] = [mod]
            module_loader.exec_module(mod)
            # Go through attributes to find imported modules
            for name in dir(mod):
                module = cast("StudentModule", getattr(mod, name))
                if isinstance(module, ModuleType):
                    assert module.__file__ is not None
                    code_file_path = Path(module.__file__)
                    # Only execute modules outside of this directory
                    if code_file_path.parent != Path(__file__).resolve().parent:
                        self.mods.append(module)
                        spec = importlib.util.spec_from_file_location(
                            name, code_file_path.resolve()
                        )
                        module_loader.exec_module(module)
        except SyntaxError as e:
            # Since we don't start the GUI until after we parse the student's code,
            # SyntaxErrors behave normally. However, if the syntax error is somehow
            # not caught at parse time, we should forward the error message to console.
            print(e)
            raise

        # Do not proceed if the student has not defined a main function.
        if not hasattr(self.mods[0], "main"):
            raise RuntimeError(
                "Couldn't find the main() function. Are you sure you have one?"
            )

    def __repr__(self) -> str:
        return "\n".join([inspect.getsource(mod) for mod in self.mods])

    def inject_namespace(self, karel: KarelProgram) -> None:
        """
        This function is responsible for doing some Python hackery
        that associates the generic commands the student wrote in their
        file with specific commands relating to the Karel object that exists
        in the world.
        """
        functions_to_override = [
            "move",
            "turn_left",
            "pick_beeper",
            "put_beeper",
            "facing_north",
            "facing_south",
            "facing_east",
            "facing_west",
            "not_facing_north",
            "not_facing_south",
            "not_facing_east",
            "not_facing_west",
            "front_is_clear",
            "beepers_present",
            "no_beepers_present",
            "beepers_in_bag",
            "no_beepers_in_bag",
            "front_is_blocked",
            "left_is_blocked",
            "left_is_clear",
            "right_is_blocked",
            "right_is_clear",
            "paint_corner",
            "corner_color_is",
        ]
        for mod in self.mods:
            for func in functions_to_override:
                setattr(mod, func, getattr(karel, func))

    def main(self) -> None:
        try:
            self.mods[0].main()
        except Exception as e:
            if isinstance(e, KarelException | NameError | RuntimeError):
                self.print_error_traceback(e)
            raise

    def print_error_traceback(
        self, e: KarelException | NameError | RuntimeError
    ) -> None:
        """Handle runtime errors while executing student code."""
        display_frames: list[tuple[FrameType, int]] = []
        # Walk through all the frames in stack trace at time of failure
        for frame, lineno in tb.walk_tb(e.__traceback__):
            frame_info = inspect.getframeinfo(frame)
            # Get the name of the file corresponding to the current frame
            # Only display frames generated within the student's code
            if Path(frame_info.filename).name == f"{self.module_name}.py":
                display_frames.append((frame, lineno))

        display_frames_generator = (frame for frame in display_frames)
        trace = tb.format_list(tb.StackSummary.extract(display_frames_generator))
        clean_traceback = "".join(trace).strip()
        add_did_you_mean(e)
        print(
            f"Traceback (most recent call last):\n{clean_traceback}\n"
            f"{type(e).__name__}: {e}"
        )


class KarelApplication:
    def __init__(
        self,
        karel: KarelProgram,
        code_file: Path,
        canvas_width: int = 600,
        canvas_height: int = 400,
    ) -> None:

        self.karel = karel
        self.world = karel.world
        self.code_file = code_file
        self.load_student_code()
        if not self.student_code.mods:
            return
        
        self.canvas_width = canvas_width
        self.canvas_height = canvas_height
        self.create_canvas()

    def load_student_code(self) -> None:
        self.student_code = StudentCode(self.code_file)
        self.student_code.inject_namespace(self.karel)
        self.inject_decorator_namespace()

    def create_canvas(self) -> None:
        """This method creates the canvas on which Karel and the world are drawn."""
        self.canvas = KarelCanvas(
            self.canvas_width,
            self.canvas_height,
            world=self.world,
            karel=self.karel,
        )

    def karel_action_decorator(
        self, karel_fn: Callable[..., None]
    ) -> Callable[..., None]:
        def wrapper(*args, **kwargs) -> None:
            # execute Karel function
            karel_fn(*args, **kwargs)
            # redraw canvas with updated state of the world
            self.canvas.draw()
            # delay by specified amount
            # TODO: This should be replaced by time.sleep once the environment supports it
            HTMLCanvas.sleep(300)

        return wrapper

    def inject_decorator_namespace(self) -> None:
        """
        This function is responsible for doing some Python hackery
        that associates the generic commands the student wrote in their
        file with specific commands relating to the Karel object that exists
        in the world.
        """
        for mod in self.student_code.mods:
            mod.turn_left = self.karel_action_decorator(self.karel.turn_left)
            mod.move = self.karel_action_decorator(self.karel.move)
            mod.pick_beeper = self.karel_action_decorator(self.karel.pick_beeper)
            mod.put_beeper = self.karel_action_decorator(self.karel.put_beeper)
            mod.paint_corner = self.karel_action_decorator(self.karel.paint_corner)

    def run_program(self) -> None:
        self.load_student_code()
        self.student_code.main()
