$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 1280,769
$bitmap.SetResolution(72,72)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$background = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#101e2b'))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f8f7f2'))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#c0ccd4'))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#67dcc2'))
$panel = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#213646'))
$heading = New-Object System.Drawing.Font 'Segoe UI',54,([System.Drawing.FontStyle]::Bold),([System.Drawing.GraphicsUnit]::Pixel)
$label = New-Object System.Drawing.Font 'Segoe UI',24,([System.Drawing.FontStyle]::Bold),([System.Drawing.GraphicsUnit]::Pixel)
$body = New-Object System.Drawing.Font 'Segoe UI',29,([System.Drawing.FontStyle]::Regular),([System.Drawing.GraphicsUnit]::Pixel)
$small = New-Object System.Drawing.Font 'Segoe UI',22,([System.Drawing.FontStyle]::Regular),([System.Drawing.GraphicsUnit]::Pixel)
$graphics.FillRectangle($background,0,0,1280,769)
$graphics.FillRectangle($accent,64,61,64,6)
$graphics.DrawString('PUBLIC SOURCE RESEARCH',$label,$accent,64,95)
$graphics.DrawString('Compare 3 competitors',$heading,$white,60,155)
$graphics.DrawString('Pricing. Features. Sources.',$heading,$white,60,223)
$graphics.DrawString('A clear snapshot for your next business decision.',$body,$muted,64,319)
$columns = @('PUBLIC OFFERS','PRICE CONTEXT','FEATURES')
for ($i = 0; $i -lt 3; $i++) {
    $x = 64 + ($i * 386)
    $graphics.FillRectangle($panel,$x,406,354,151)
    $graphics.DrawString($columns[$i],$label,$accent,$x+24,430)
    $line = @('Named competitors','Billing and unknowns','Side by side')[$i]
    $graphics.DrawString($line,$small,$white,$x+24,483)
}
$graphics.DrawString('Source URLs  |  Access dates  |  Practical summary',$body,$white,64,609)
$graphics.DrawString('Public information only. No product testing or private quotes.',$small,$muted,64,686)
$outputPath = Join-Path $PSScriptRoot 'gallery.png'
$bitmap.Save($outputPath,[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
foreach ($resource in @($background,$white,$muted,$accent,$panel,$heading,$label,$body,$small)) { $resource.Dispose() }
Write-Output "Created original gallery: $outputPath"
