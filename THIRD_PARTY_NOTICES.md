# Third-Party Notices

This project's Race Replay feature (`frontend/src/pages/RaceReplayPage.js`,
`frontend/src/components/race-replay/`) adapts a concept from:

**F1 Race Replay**
Copyright (c) Tom Shaw ([tomshaw.dev](https://tomshaw.dev))
Source: https://github.com/tomshaw3591/f1-race-replay
License: MIT

Specifically, the safety-car "deployed at a fixed distance ahead of the
current leader" concept and its deploying/on-track/returning phase model
are adapted from that project's `_compute_safety_car_positions()` function
in `src/f1_data.py`. The original computes this offset in real track metres
using a dense reference polyline and a KD-tree nearest-point lookup against
FastF1 telemetry. This project's port instead expresses the offset as a
fraction of a simplified lap and positions it using the browser's native
`SVGPathElement.getPointAtLength()` API, since a full circuit polyline
isn't part of this app's data model.

---

MIT License (as stated in the F1 Race Replay README):

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files, to deal in the
Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, subject to the above copyright notice and this
permission notice being included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED.