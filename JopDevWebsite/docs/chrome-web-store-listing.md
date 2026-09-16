# RakingPix Chrome Web Store listing

RakingPix 0.1.1 is available from the
[official Chrome Web Store listing](https://chromewebstore.google.com/detail/rakingpix/hbjnnjpcfhfakajpgglmkkemfginefkm).

## Name

RakingPix

## Short description

Scan, filter, rename, organize, and download images from the active webpage.

## Detailed description

RakingPix gives you one complete side-panel workflow for finding and
downloading images from the webpage you are viewing.

- Scan the active webpage for images.
- Filter results, including by minimum width and minimum height.
- Select individual images, select all current results, or clear the selection.
- Download the selected images.
- Customize filenames with advanced naming and automatic numbering options.
- Organize downloads into folders and subfolders.
- Preview filenames and folder paths before downloading.
- Save preferences and use the included tutorials and help.

All current features are included. Ads are disabled in the current release.

## Permission rationale

The submitted disclosures must be checked against the packaged release
manifest. Retain only the explanations for permissions that the release
actually declares.

- Active-page access: used only after the user starts a scan, so RakingPix can
  inspect the current page for image elements and related image metadata.
- Script injection: used, when declared, to run the user-requested scanner in
  the active page.
- Downloads: used to save only the images the user chooses, with the requested
  filenames and folder paths.
- Extension storage: used for preferences, filter values, naming and folder
  options, tutorial state, theme choices, and recent workflow state.
- Side panel: used to provide the extension's primary interface alongside the
  active webpage.
- Site or host access: used, when declared, to retrieve selected image resources
  from their source servers for previewing or downloading.

No permission rationale should be included unless the corresponding permission
is present in the submitted manifest and required by the current build.

## Privacy and data-disclosure guidance

- The extension processes active-page and image information needed for a scan,
  which may include page and image URLs, image dimensions, alt text, and
  related source metadata.
- Scanning, filtering, selection, naming, organization, and preview generation
  occur within the extension.
- Settings and workflow state are stored in browser-managed extension storage.
- Downloads are initiated by the user and handled through Chrome's download
  system. Image hosts receive ordinary network requests when their resources
  are loaded or downloaded.
- The current release does not include custom analytics, telemetry,
  advertising, or ad tracking.
- A user who contacts support separately provides their email address and the
  contents of their message so JopDev can respond.
- JopDev does not sell RakingPix user data.

The store's privacy answers must remain consistent with the published
[RakingPix Privacy Policy](https://jopdev.com/rakingpix/privacy/).
