# Security policy

These packages carry the rule the MalverdeSoftware tools are built on: the software provider never accesses, owns or keeps a readable copy of what researchers upload or participants submit. Data is sealed in the browser (`@malverdesoftware/sealed-envelope`), and the relay (`@malverdesoftware/relay`) stores only ciphertext and hashes of creation keys. A flaw that breaks that rule, or lets someone read or alter another person's session, is a security problem.

## Supported versions

The latest release of each package on npm. The packages are early releases (0.x); fixes are not backported to older versions.

The known limits of the design, such as metadata the relay can see and the trust participants place in served code, are listed in [docs/CONVENTIONS.md](docs/CONVENTIONS.md#known-limits). Reports that go beyond those are especially welcome.

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately through GitHub: on this repository's **Security** tab, choose **Report a vulnerability**. Include what you found, how to reproduce it, and what it could expose.

You'll get an acknowledgment within 7 days. Fixes for confirmed problems ship in a new release, and the advisory is published once a fix is available, with credit to the reporter unless you'd rather not be named.

Never include real participant data, session key files, management keys or passcodes in a report. Use synthetic sessions.
