# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Official BDK-RN 1.0 TurboModule/UniFFI bridge. Consumer rules normally preserve
# these classes; the explicit rule protects release builds from future R8 changes.
-keep class com.bdkrn.** { *; }
-keep interface com.bdkrn.** { *; }
