#define MyAppName "Void-Editor SilenceCut"
#define MyAppVersion "1.0.10"
#define MyAppPublisher "Void Software"
#define PluginFolderName "voideditor.silencecut"

[Setup]
AppId={{A3F2B1C4-9D7E-4F3A-B2C1-8E5D6A4F3B2C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
LicenseFile=LICENSE
OutputDir=.
OutputBaseFilename=VoidEditor_SilenceCut_Setup_v1.0.10
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "Full installation (Premiere Pro + DaVinci Resolve)"
Name: "premiere"; Description: "Adobe Premiere Pro only"
Name: "davinci"; Description: "DaVinci Resolve only"

[Components]
Name: "premiere"; Description: "Adobe Premiere Pro Plugin"; Types: full premiere; Flags: fixed
Name: "davinci"; Description: "DaVinci Resolve Plugin (if installed)"; Types: full davinci

[Files]
Source: "client\*"; DestDir: "{userappdata}\Adobe\CEP\extensions\{#PluginFolderName}\client"; Components: premiere; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "CSXS\*"; DestDir: "{userappdata}\Adobe\CEP\extensions\{#PluginFolderName}\CSXS"; Components: premiere; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "dist\*"; DestDir: "{userappdata}\Adobe\CEP\extensions\{#PluginFolderName}\dist"; Components: premiere; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "host\*"; DestDir: "{userappdata}\Adobe\CEP\extensions\{#PluginFolderName}\host"; Components: premiere; Flags: recursesubdirs createallsubdirs ignoreversion

Source: "client\*"; DestDir: "{userappdata}\Blackmagic Design\DaVinci Resolve\Support\CEP\extensions\{#PluginFolderName}\client"; Components: davinci; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "CSXS\*"; DestDir: "{userappdata}\Blackmagic Design\DaVinci Resolve\Support\CEP\extensions\{#PluginFolderName}\CSXS"; Components: davinci; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "dist\*"; DestDir: "{userappdata}\Blackmagic Design\DaVinci Resolve\Support\CEP\extensions\{#PluginFolderName}\dist"; Components: davinci; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "host\*"; DestDir: "{userappdata}\Blackmagic Design\DaVinci Resolve\Support\CEP\extensions\{#PluginFolderName}\host"; Components: davinci; Flags: recursesubdirs createallsubdirs ignoreversion

[Dirs]
Name: "{userappdata}\Adobe\CEP\extensions"; Components: premiere
Name: "{userappdata}\Blackmagic Design\DaVinci Resolve\Support\CEP\extensions"; Components: davinci

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\Adobe\CEP\extensions\{#PluginFolderName}"
Type: filesandordirs; Name: "{userappdata}\Blackmagic Design\DaVinci Resolve\Support\CEP\extensions\{#PluginFolderName}"

[Messages]
FinishedLabel=Void-Editor SilenceCut v1.0.10 successfully installed.%n%nVoid Software - Offline Software Solutions%nAktug Antika trademark%nMore info: aktugantika@gmail.com%n%nTo use: Open Premiere Pro > Window > Extensions > Void-Editor SilenceCut
