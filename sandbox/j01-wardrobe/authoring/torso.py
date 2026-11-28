"""A common bind-space shape for the chest, shoulders and fitted cloth layers."""
from mathutils import Vector

from mesh import smooth


def fit_torso(point):
    x, y, z = point
    side = abs(y)
    # Ease the front plane back toward the collar; retain the ribcage below it.
    chest = (smooth(.708, .778, z) * (1 - smooth(.798, .834, z))
             * smooth(.022, .063, x) * (1 - smooth(.052, .139, side)))
    # Round the shoulder cap over the same pivot; fade out before the sleeve.
    cap = (smooth(.054, .109, side) * (1 - smooth(.117, .172, side))
           * smooth(.712, .767, z) * (1 - smooth(.804, .836, z)))
    return Vector((x - .020 * chest, y * (1 - .020 * cap), z - .009 * cap))
