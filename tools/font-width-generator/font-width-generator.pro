QT += core gui svg
CONFIG += console release c++17
CONFIG -= app_bundle
msvc:QMAKE_CXXFLAGS += /utf-8
TEMPLATE = app
TARGET = font-width-generator
SOURCES += main.cpp
