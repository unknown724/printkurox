Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint"
WshShell.Run "node scripts\printer_listener.js", 0, False
