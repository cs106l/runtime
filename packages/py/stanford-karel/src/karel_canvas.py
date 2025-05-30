"""
This file defines the canvas upon which a Karel world is drawn. This
class defines all necessary methods to draw all components of a Karel
world, including walls, beepers, and Karel itself. All Karel applications
contains exactly one Karel Canvas object and each Karel Canvas object
holds information about one Karel World and one Karel object.

Original Author: Nicholas Bowman
Credits: Kylie Jue, Tyler Yep
License: MIT
Version: 1.0.0
Email: nbowman@stanford.edu
Date of Creation: 10/1/2019
"""

from __future__ import annotations

import cmath
import math
from typing import TYPE_CHECKING

from context2d import Context2D

from .karel_world import Direction, KarelWorld, Wall

if TYPE_CHECKING:
    from .karel_program import KarelProgram

DIRECTION_TO_RADIANS = {
    Direction.EAST: 0,
    Direction.SOUTH: math.pi / 2,
    Direction.WEST: math.pi,
    Direction.NORTH: 3 * math.pi / 2,
}

# Karel Application + World Editor
DEFAULT_ICON = "karel"
PAD_X = 75
PAD_Y = 10
LIGHT_GREY = "#e5e5e5"

WALL_DETECTION_THRESHOLD = 0.1
BORDER_OFFSET = 17
LABEL_OFFSET = 10
CORNER_SIZE = 2
BEEPER_CELL_SIZE_FRAC = 0.4
LINE_WIDTH = 2
# Drawing Constants for Karel Robot Icon (defined relative to a single cell)
KAREL_VERTICAL_OFFSET = 0.05
KAREL_LEFT_HORIZONTAL_PAD = 0.29
KAREL_HEIGHT = 0.76
KAREL_WIDTH = 0.58
KAREL_INNER_HEIGHT = 0.38
KAREL_INNER_WIDTH = 0.28125
KAREL_INNER_OFFSET = 0.125
KAREL_MOUTH_WIDTH = 0.1375
KAREL_MOUTH_HORIZONTAL_OFFSET = 0.2625
KAREL_MOUTH_VERTICAL_OFFSET = 0.125
KAREL_UPPER_RIGHT_DIAG = 0.2
KAREL_LOWER_LEFT_DIAG = 0.13125
KAREL_LEG_LENGTH = 0.15
KAREL_FOOT_LENGTH = 0.1875
KAREL_LEG_FOOT_WIDTH = 0.075
KAREL_LEG_VERTICAL_OFFSET = 0.5
KAREL_LEG_HORIZONTAL_OFFSET = 0.2625
KAREL_LINE_WIDTH = 2
# Drawing Constants for Simple Karel Icon (defined relative to a single cell)
SIMPLE_KAREL_HEIGHT = 0.7
SIMPLE_KAREL_WIDTH = 0.8


class KarelCanvas(Context2D):
    def __init__(
        self,
        width: int,
        height: int,
        world: KarelWorld,
        karel: KarelProgram
    ) -> None:
        super().__init__(width=width, height=height)
        self.world = world
        self.karel = karel
        self.icon = DEFAULT_ICON

        self.init_geometry_values()
        self.draw()

    @staticmethod
    def rotate_points(
        center: tuple[float, float], points: list[float], direction: float
    ) -> None:
        """
        Rotation logic derived from http://effbot.org/zone/tkinter-complex-canvas.htm
        """
        cangle = cmath.exp(direction * 1j)
        ccenter = complex(center[0], center[1])
        for i in range(0, len(points), 2):
            x, y = points[i], points[i + 1]
            v = cangle * (complex(x, y) - ccenter) + ccenter
            points[i], points[i + 1] = v.real, v.imag

    def create_default_polygon(
        self,
        points: list[float],
        fill: str = "black",
        outline: bool = True
    ) -> None:
        if len(points) < 4 or len(points) % 2 != 0:
            raise ValueError("Points must contain an even number of coordinates and at least one segment.")

        self.begin_path()
        self.move_to(points[0], points[1])
        for i in range(2, len(points), 2):
            self.line_to(points[i], points[i + 1])
        self.close_path()

        if fill:
            self.fill_style = fill
            self.fill()

        if outline:
            self.stroke()

    def create_line(self, x1: float, y1: float, x2: float, y2: float, width: float=1):
        self.begin_path()
        self.move_to(x1, y1)
        self.line_to(x2, y2)
        self.line_width = width
        self.stroke()

    def create_text(self, x: float, y: float, text: str, fill: str = "black", font: str = ""):
        if fill: self.fill_style = fill
        if font: self.font = font
        self.fill_text(text, x, y)

    def create_rectangle(self, x1: float, y1: float, x2: float, y2: float, fill: str = "", outline: bool = True):
        self.begin_path()
        self.rect(x1, y1, x2 - x1, y2 - y1)
        if fill:
            self.fill_style = fill
            self.fill()
        
        if outline:
            self.stroke()

    def draw(self) -> None:
        self.stroke_style = "black"
        self.text_align = "center"
        self.text_baseline = "middle"

        self.draw_world()
        self.draw_karel()
        self.commit()

    def draw_world(self) -> None:
        self.draw_bounding_rectangle()
        # self.label_axes()
        self.draw_corners()
        self.draw_all_beepers()
        self.draw_all_walls()

    def init_geometry_values(self) -> None:
        # Calculate the maximum possible cell size in both directions
        # We will use the smaller of the two as the bounding cell size
        horizontal_cell_size = (
            self.width - 2 * BORDER_OFFSET
        ) / self.world.num_avenues
        vertical_cell_size = (
            self.height - 2 * BORDER_OFFSET
        ) / self.world.num_streets

        # Save this as an instance variable for later use
        self.cell_size = min(horizontal_cell_size, vertical_cell_size)

        self.boundary_height = self.cell_size * self.world.num_streets
        self.boundary_width = self.cell_size * self.world.num_avenues

        # Save all these as instance variables as well
        self.left_x = self.width / 2 - self.boundary_width / 2
        self.top_y = self.height / 2 - self.boundary_height / 2
        self.right_x = self.left_x + self.boundary_width
        self.bottom_y = self.top_y + self.boundary_height

    def draw_bounding_rectangle(self) -> None:
        # Draw the external bounding lines of Karel's world
        self.create_line(
            self.left_x, self.top_y, self.right_x, self.top_y, width=LINE_WIDTH
        )
        self.create_line(
            self.left_x, self.top_y, self.left_x, self.bottom_y, width=LINE_WIDTH
        )
        self.create_line(
            self.right_x, self.top_y, self.right_x, self.bottom_y, width=LINE_WIDTH
        )
        self.create_line(
            self.left_x, self.bottom_y, self.right_x, self.bottom_y, width=LINE_WIDTH
        )

    def label_axes(self) -> None:
        # Label the avenue axes
        for avenue in range(1, self.world.num_avenues + 1):
            label_x = self.calculate_corner_x(avenue)
            label_y = self.bottom_y + LABEL_OFFSET
            self.create_text(label_x, label_y, text=str(avenue), font="10px Arial")

        # Label the street axes
        for street in range(1, self.world.num_streets + 1):
            label_x = self.left_x - LABEL_OFFSET
            label_y = self.calculate_corner_y(street)
            self.create_text(label_x, label_y, text=str(street), font="10px Arial")

    def draw_corners(self) -> None:
        # Draw all corner markers in the world
        for avenue in range(1, self.world.num_avenues + 1):
            for street in range(1, self.world.num_streets + 1):
                color = self.world.corner_color(avenue, street)
                corner_x = self.calculate_corner_x(avenue)
                corner_y = self.calculate_corner_y(street)
                if not color:
                    self.create_line(
                        corner_x,
                        corner_y - CORNER_SIZE,
                        corner_x,
                        corner_y + CORNER_SIZE,
                    )
                    self.create_line(
                        corner_x - CORNER_SIZE,
                        corner_y,
                        corner_x + CORNER_SIZE,
                        corner_y,
                    )
                else:
                    self.create_rectangle(
                        corner_x - self.cell_size / 2,
                        corner_y - self.cell_size / 2,
                        corner_x + self.cell_size / 2,
                        corner_y + self.cell_size / 2,
                        fill=color,
                        outline=False,
                    )

    def draw_all_beepers(self) -> None:
        for location, count in self.world.beepers.items():
            self.draw_beeper(location, count)

    def draw_beeper(self, location: tuple[int, int], count: int) -> None:
        # handle case where defaultdict returns 0 count by not drawing beepers
        if count == 0:
            return

        corner_x = self.calculate_corner_x(location[0])
        corner_y = self.calculate_corner_y(location[1])
        beeper_radius = self.cell_size * BEEPER_CELL_SIZE_FRAC

        points = [
            corner_x,
            corner_y - beeper_radius,
            corner_x + beeper_radius,
            corner_y,
            corner_x,
            corner_y + beeper_radius,
            corner_x - beeper_radius,
            corner_y,
        ]
        self.create_default_polygon(points, fill="lightgray")

        if count > 1:
            self.create_text(
                corner_x, corner_y, text=str(count), font="12px Arial", fill="black"
            )

    def draw_all_walls(self) -> None:
        for wall in self.world.walls:
            self.draw_wall(wall)

    def draw_wall(self, wall: Wall) -> None:
        avenue, street, direction = wall.avenue, wall.street, wall.direction
        corner_x = self.calculate_corner_x(avenue)
        corner_y = self.calculate_corner_y(street)

        if direction == Direction.NORTH:
            self.create_line(
                corner_x - self.cell_size / 2,
                corner_y - self.cell_size / 2,
                corner_x + self.cell_size / 2,
                corner_y - self.cell_size / 2,
                width=LINE_WIDTH,
            )
        if direction == Direction.SOUTH:
            self.create_line(
                corner_x - self.cell_size / 2,
                corner_y + self.cell_size / 2,
                corner_x + self.cell_size / 2,
                corner_y + self.cell_size / 2,
                width=LINE_WIDTH,
            )
        if direction == Direction.EAST:
            self.create_line(
                corner_x + self.cell_size / 2,
                corner_y - self.cell_size / 2,
                corner_x + self.cell_size / 2,
                corner_y + self.cell_size / 2,
                width=LINE_WIDTH,
            )
        if direction == Direction.WEST:
            self.create_line(
                corner_x - self.cell_size / 2,
                corner_y - self.cell_size / 2,
                corner_x - self.cell_size / 2,
                corner_y + self.cell_size / 2,
                width=LINE_WIDTH,
            )

    def draw_karel(self) -> None:
        corner_x = self.calculate_corner_x(self.karel.avenue)
        corner_y = self.calculate_corner_y(self.karel.street)
        center = (corner_x, corner_y)

        if self.icon == "karel":
            karel_origin_x = (
                corner_x
                - self.cell_size / 2
                + KAREL_LEFT_HORIZONTAL_PAD * self.cell_size
            )
            karel_origin_y = (
                corner_y - self.cell_size / 2 + KAREL_VERTICAL_OFFSET * self.cell_size
            )

            self.draw_karel_body(
                karel_origin_x,
                karel_origin_y,
                center,
                DIRECTION_TO_RADIANS[self.karel.direction],
            )
            self.draw_karel_legs(
                karel_origin_x,
                karel_origin_y,
                center,
                DIRECTION_TO_RADIANS[self.karel.direction],
            )
        elif self.icon == "simple":
            self.draw_simple_karel_icon(
                center, DIRECTION_TO_RADIANS[self.karel.direction]
            )

    def generate_external_karel_points(
        self, x: float, y: float, center: tuple[float, float], direction: float
    ) -> list[float]:
        outer_points = []

        # Top-left point (referred to as origin) of Karel's body
        outer_points += [x, y]

        # Calculate Karel's height and width as well as missing diag segments
        width = self.cell_size * KAREL_WIDTH
        height = self.cell_size * KAREL_HEIGHT
        lower_left_missing = (self.cell_size * KAREL_LOWER_LEFT_DIAG) / math.sqrt(2)
        upper_right_missing = (self.cell_size * KAREL_UPPER_RIGHT_DIAG) / math.sqrt(2)

        # These two points define Karel's upper right
        outer_points += [x + width - upper_right_missing, y]
        outer_points += [x + width, y + upper_right_missing]

        # Karel's bottom right edge
        outer_points += [x + width, y + height]

        # These two points define Karel's lower left
        outer_points += [x + lower_left_missing, y + height]
        outer_points += [x, y + height - lower_left_missing]

        # Complete the polygon
        outer_points += [x, y]

        # Rotate all external body points to get correct Karel orientation
        self.rotate_points(center, outer_points, direction)

        return outer_points

    def generate_internal_karel_points(
        self, x: float, y: float, center: tuple[float, float], direction: float
    ) -> list[float]:
        # Calculate dimensions and location of Karel's inner eye
        inner_x = x + self.cell_size * KAREL_INNER_OFFSET
        inner_y = y + self.cell_size * KAREL_INNER_OFFSET
        inner_height = self.cell_size * KAREL_INNER_HEIGHT
        inner_width = self.cell_size * KAREL_INNER_WIDTH

        # Define inner body points
        inner_points = [
            inner_x,
            inner_y,
            inner_x + inner_width,
            inner_y,
            inner_x + inner_width,
            inner_y + inner_height,
            inner_x,
            inner_y + inner_height,
            inner_x,
            inner_y,
        ]
        self.rotate_points(center, inner_points, direction)

        return inner_points

    def draw_karel_body(
        self, x: float, y: float, center: tuple[float, float], direction: float
    ) -> None:
        outer_points = self.generate_external_karel_points(x, y, center, direction)
        inner_points = self.generate_internal_karel_points(x, y, center, direction)

        # Non-convex polygon that determines Karel's entire body is a combination
        # of the two sets of points defining internal and external components
        entire_body_points = outer_points + inner_points

        # First draw the filled non-convex polygon
        self.create_default_polygon(entire_body_points, fill="white", outline=False)

        # Then draw the transparent exterior edges of Karel's body
        self.create_default_polygon(outer_points, fill="")
        self.create_default_polygon(inner_points, fill="")

        # Define dimensions and location of Karel's mouth
        # karel_height = self.cell_size * KAREL_HEIGHT
        mouth_horizontal_offset = self.cell_size * KAREL_MOUTH_HORIZONTAL_OFFSET
        mouth_vertical_offset = self.cell_size * KAREL_MOUTH_VERTICAL_OFFSET
        inner_y = y + self.cell_size * KAREL_INNER_OFFSET
        inner_height = self.cell_size * KAREL_INNER_HEIGHT
        mouth_width = self.cell_size * KAREL_MOUTH_WIDTH

        mouth_y = inner_y + inner_height + mouth_vertical_offset

        # Define, rotate, and draw points
        mouth_points = [
            x + mouth_horizontal_offset,
            mouth_y,
            x + mouth_horizontal_offset + mouth_width,
            mouth_y,
        ]
        self.rotate_points(center, mouth_points, direction)
        self.create_default_polygon(mouth_points, fill="white")

    def draw_karel_legs(
        self, x: float, y: float, center: tuple[float, float], direction: float
    ) -> None:
        leg_length = self.cell_size * KAREL_LEG_LENGTH
        foot_length = self.cell_size * KAREL_FOOT_LENGTH
        leg_foot_width = self.cell_size * KAREL_LEG_FOOT_WIDTH

        vertical_offset = self.cell_size * KAREL_LEG_VERTICAL_OFFSET
        horizontal_offset = self.cell_size * KAREL_LEG_HORIZONTAL_OFFSET

        # Generate points for left leg
        points = []
        points += [x, y + vertical_offset]
        points += [x - leg_length, y + vertical_offset]
        points += [x - leg_length, y + vertical_offset + foot_length]
        points += [x - leg_length + leg_foot_width, y + vertical_offset + foot_length]
        points += [
            x - leg_length + leg_foot_width,
            y + vertical_offset + leg_foot_width,
        ]
        points += [x, y + vertical_offset + leg_foot_width]
        points += [x, y + vertical_offset]

        self.rotate_points(center, points, direction)
        self.create_default_polygon(points, outline=False)

        # Reset point of reference to be bottom left rather than top_left
        y += self.cell_size * KAREL_HEIGHT

        # Generate points for right leg
        points = []
        points += [x + horizontal_offset, y]
        points += [x + horizontal_offset, y + leg_length]
        points += [x + horizontal_offset + foot_length, y + leg_length]
        points += [x + horizontal_offset + foot_length, y + leg_length - leg_foot_width]
        points += [
            x + horizontal_offset + leg_foot_width,
            y + leg_length - leg_foot_width,
        ]
        points += [x + horizontal_offset + leg_foot_width, y]
        points += [x + horizontal_offset, y]

        self.rotate_points(center, points, direction)
        self.create_default_polygon(points, outline=False)

    def draw_simple_karel_icon(
        self, center: tuple[float, float], direction: float
    ) -> None:
        simple_karel_width = self.cell_size * SIMPLE_KAREL_WIDTH
        simple_karel_height = self.cell_size * SIMPLE_KAREL_HEIGHT
        center_x, center_y = center
        points = []
        points += [
            center_x - simple_karel_width / 2,
            center_y - simple_karel_height / 2,
        ]
        points += [
            center_x - simple_karel_width / 2,
            center_y + simple_karel_height / 2,
        ]
        points += [center_x, center_y + simple_karel_height / 2]
        points += [center_x + simple_karel_width / 2, center_y]
        points += [center_x, center_y - simple_karel_height / 2]
        points += [
            center_x - simple_karel_width / 2,
            center_y - simple_karel_height / 2,
        ]
        self.rotate_points(center, points, direction)
        self.create_default_polygon(points, fill="background")

    def calculate_corner_x(self, avenue: float) -> float:
        return self.left_x + self.cell_size / 2 + (avenue - 1) * self.cell_size

    def calculate_corner_y(self, street: float) -> float:
        return (
            self.top_y
            + self.cell_size / 2
            + (self.world.num_streets - street) * self.cell_size
        )

    def click_in_world(self, x: float, y: float) -> bool:
        x = x - self.left_x
        y = y - self.top_y
        return 0 <= x < self.boundary_width and 0 <= y < self.boundary_height

    def calculate_location(self, x: float, y: float) -> tuple[float, float]:
        x = x - self.left_x
        y = y - self.top_y
        return (
            max(x, 0) // self.cell_size + 1,
            max((self.boundary_height - 1 - y), 0) // self.cell_size + 1,
        )

    def find_nearest_wall(
        self, x: float, y: float, avenue: int, street: int
    ) -> Wall | None:
        corner_x = self.calculate_corner_x(avenue)
        corner_y = self.calculate_corner_y(street)
        wall_proximity = self.cell_size * WALL_DETECTION_THRESHOLD

        if x > (corner_x + self.cell_size / 2 - wall_proximity):
            # Check for a wall to the east
            return Wall(avenue, street, Direction.EAST)
        if x < (corner_x - self.cell_size / 2 + wall_proximity):
            # Check for a wall to the west
            return Wall(avenue, street, Direction.WEST)
        if y > (corner_y + self.cell_size / 2 - wall_proximity):
            # Check for a wall to the south
            return Wall(avenue, street, Direction.SOUTH)
        if y < (corner_y - self.cell_size / 2 + wall_proximity):
            # Check for a wall to the north
            return Wall(avenue, street, Direction.NORTH)

        # No wall within threshold distance
        return None
