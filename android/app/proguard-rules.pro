# kotlinx.serialization: keep serializers for our models
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class com.larea.app.**$$serializer { *; }
-keepclassmembers class com.larea.app.** { *** Companion; }
-keepclasseswithmembers class com.larea.app.** { kotlinx.serialization.KSerializer serializer(...); }
# Retrofit
-keepattributes Signature, Exceptions
-dontwarn org.codehaus.mojo.animal_sniffer.*
