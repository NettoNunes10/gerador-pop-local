Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)

pythonw = "C:\Users\netto\AppData\Local\Programs\Python\Python310\pythonw.exe"
If Not fso.FileExists(pythonw) Then
  pythonw = "pythonw.exe"
End If

cmd = """" & pythonw & """ """ & projectDir & "\run_app_window.py"""
shell.Run cmd, 0, False
