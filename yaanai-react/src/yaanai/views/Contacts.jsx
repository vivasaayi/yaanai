import React from 'react'
import {
  CButton,
  CCard,
  CCardBody,
  CCardFooter,
  CCardGroup,
  CCardHeader,
  CCardImage,
  CCardLink,
  CCardSubtitle,
  CCardText,
  CCardTitle,
  CListGroup,
  CListGroupItem,
  CNav,
  CNavItem,
  CNavLink,
  CCol,
  CRow,
} from '@coreui/react'
// import { DocsExample } from '../../../components'

import ReactImg from '../../../src/assets/images/react.jpg'

const Contacts = () => {
  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Example</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Cards are built with as little markup and styles as possible but still manage to
              deliver a bunch of control and customization. Built with flexbox, they offer easy
              alignment and mix well with other CoreUI components. Cards have no top, left, and
              right margins by default, so use{' '}
              <a href="https://coreui.io/docs/utilities/spacing">spacing utilities</a> as needed.
              They have no fixed width to start, so they&#39;ll fill the full width of its parent.
            </p>
            <p className="text-medium-emphasis small">
              Below is an example of a basic card with mixed content and a fixed width. Cards have
              no fixed width to start, so they&#39;ll naturally fill the full width of its parent
              element.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Body</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              The main block of a card is the <code>&lt;CCardBody&gt;</code>. Use it whenever you
              need a padded section within a card.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Titles, text, and links</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Card titles are managed by <code>&lt;CCardTitle&gt;</code> component. Identically,
              links are attached and collected next to each other by <code>&lt;CCardLink&gt;</code>{' '}
              component.
            </p>
            <p className="text-medium-emphasis small">
              Subtitles are managed by <code>&lt;CCardSubtitle&gt;</code> component. If the{' '}
              <code>&lt;CCardTitle&gt;</code> also, the <code>&lt;CCardSubtitle&gt;</code> items are
              stored in a <code>&lt;CCardBody&gt;</code> item, the card title, and subtitle are
              arranged rightly.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Images</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              <code>.card-img-top</code> places a picture to the top of the card. With{' '}
              <code>.card-text</code>, text can be added to the card. Text within{' '}
              <code>.card-text</code> can additionally be styled with the regular HTML tags.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>List groups</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Create lists of content in a card with a flush list group.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Kitchen sink</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Combine and match many content types to build the card you need, or throw everything
              in there. Shown below are image styles, blocks, text styles, and a list group—all
              wrapped in a fixed-width card.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Header and footer</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Add an optional header and/or footer within a card.
            </p>
            <p className="text-medium-emphasis small">
              Card headers can be styled by adding ex. <code>component=&#34;h5&#34;</code>.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Body</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Cards assume no specific <code>width</code> to start, so they&#39;ll be 100% wide
              unless otherwise stated. You can adjust this as required with custom CSS, grid
              classes, grid Sass mixins, or services.
            </p>
            <h3>Using grid markup</h3>
            <p className="text-medium-emphasis small">
              Using the grid, wrap cards in columns and rows as needed.
            </p>
            <h3>Using utilities</h3>
            <p className="text-medium-emphasis small">
              Use some of{' '}
              <a href="https://coreui.io/docs/utilities/sizing/">available sizing utilities</a> to
              rapidly set a card&#39;s width.
            </p>
            <strong>Using custom CSS</strong>
            <p className="text-medium-emphasis small">
              Use custom CSS in your stylesheets or as inline styles to set a width.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Text alignment</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              You can instantly change the text arrangement of any card—in its whole or specific
              parts—with{' '}
              <a href="https://coreui.io/docs/utilities/text/#text-alignment">text align classes</a>
              .
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Navigation</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Add some navigation to a <code>&lt;CCardHeader&gt;</code> with our{' '}
              <code>&lt;CNav&gt;</code> component.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Image caps</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Similar to headers and footers, cards can include top and bottom &#34;image
              caps&#34;—images at the top or bottom of a card.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>Card</strong> <small>Card styles</small>
          </CCardHeader>
          <CCardBody>
            <p className="text-medium-emphasis small">
              Cards include various options for customizing their backgrounds, borders, and color.
            </p>
            <h3>Background and color</h3>
            <p className="text-medium-emphasis small">
              Use <code>color</code> property to change the appearance of a card.
            </p>
            <h3>Border</h3>
            <p className="text-medium-emphasis small">
              Use <a href="https://coreui.io/docs/utilities/borders/">border utilities</a> to change
              just the <code>border-color</code> of a card. Note that you can set{' '}
              <code>textColor</code> property on the <code>&lt;CCard&gt;</code> or a subset of the
              card&#39;s contents as shown below.
            </p>
            <h3>Top border</h3>
            <p className="text-medium-emphasis small">
              Use <a href="https://coreui.io/docs/utilities/borders/">border utilities</a> to change
              just the <code>border-color</code> of a card. Note that you can set{' '}
              <code>textColor</code> property on the <code>&lt;CCard&gt;</code> or a subset of the
              card&#39;s contents as shown below.
            </p>
          </CCardBody>
        </CCard>
      </CCol>
    </CRow>
  )
}

export default Contacts
