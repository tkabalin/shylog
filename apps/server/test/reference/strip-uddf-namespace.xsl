<?xml version="1.0"?>
<!--
  Subsurface's strip_xml_namespace() (core/parse-xml.cpp), which runs before
  uddf.xslt: drop http://www.streit.cc/uddf/<version>/ from every element and
  attribute, where the version is dotted digits, and keep any other namespace.
-->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:variable name="prefix" select="'http://www.streit.cc/uddf/'"/>

  <xsl:template match="*">
    <xsl:variable name="strip">
      <xsl:call-template name="is-uddf"/>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="$strip = 'yes'">
        <xsl:element name="{local-name()}">
          <xsl:apply-templates select="@*|node()"/>
        </xsl:element>
      </xsl:when>
      <xsl:otherwise>
        <xsl:copy>
          <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="@*">
    <xsl:variable name="strip">
      <xsl:call-template name="is-uddf"/>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="$strip = 'yes'">
        <xsl:attribute name="{local-name()}">
          <xsl:value-of select="."/>
        </xsl:attribute>
      </xsl:when>
      <xsl:otherwise>
        <xsl:copy/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="text()|comment()|processing-instruction()">
    <xsl:copy/>
  </xsl:template>

  <!-- looks_like_uddf_version_suffix(): "3.2/" yes; "3..2/", ".3/", "3./", "x/" no -->
  <xsl:template name="is-uddf">
    <xsl:variable name="rest" select="substring-after(namespace-uri(), $prefix)"/>
    <xsl:if test="starts-with(namespace-uri(), $prefix)
                  and translate($rest, '0123456789.', '') = '/'
                  and substring($rest, string-length($rest)) = '/'
                  and $rest != '/'
                  and not(starts-with($rest, '.'))
                  and not(contains($rest, '..'))
                  and not(contains($rest, './'))">yes</xsl:if>
  </xsl:template>
</xsl:stylesheet>
