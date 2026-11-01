# CommandThing documentation

Start with the guide that matches what you are trying to do:

| Goal | Guide |
|---|---|
| Run CommandThing on a Mac | [Getting started](getting-started.md) |
| Change ports, Open Usage, or local paths | [Configuration](configuration.md) |
| Review bundled provider-logo sources | [Brand assets](brand-assets.md) |
| Connect a physical Car Thing | [Device setup](device-setup.md) |
| Understand components and data flow | [Architecture](architecture.md) |
| Change the code | [Development](development.md) |
| Fix a broken installation | [Troubleshooting](troubleshooting.md) |
| Prepare an npm/GitHub release | [Publishing](publishing.md) |

Historical implementation plans live in [`archive/`](archive/) and are not current instructions.

## Support boundary

CommandThing currently targets a macOS host because media control uses AppleScript and the
development workflow has been validated there. The dashboard itself is ordinary web code, while
the feeder, CLI, and device tools use Node.js.

The physical device must already run firmware that provides a kiosk/browser and ADB access. See
[Device setup](device-setup.md) before changing firmware.
